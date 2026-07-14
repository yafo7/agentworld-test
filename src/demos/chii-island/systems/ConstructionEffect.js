import * as THREE from 'three';
import { buildModelFromJson } from '../../../engine/model/builder.js';
import { defaultContentGeneration } from '../../../integrations/content/VoxelContentAdapter.js';

/**
 * Construction visual effect — architect walks around building, dust particles,
 * scaffold box, API refine, reveal animation.
 *
 * Usage:
 *   const ce = createConstructionEffect({ scene, architect });
 *   ce.onComplete = () => { ... };
 *   ce.start(buildingEntity, playerDescription);
 *   ce.update(dt); // called each frame while active
 */
export function createConstructionEffect({ scene, architect, contentPort = defaultContentGeneration }) {
  // --- state ---
  const STATE = {
    IDLE: 'idle',
    WALKING: 'walking',
    BUILDING: 'building',
    API_REFINE: 'api_refine',
    RETURNING: 'returning',
    SCAFFOLD_FADE: 'scaffold_fade',
    REVEAL: 'reveal',
  };

  let _state = STATE.IDLE;
  let _building = null;
  let _description = '';
  let _newModelJson = null;
  let _newModelGroup = null;

  // Walk phase
  let _waypoints = [];
  let _wpIndex = 0;

  // Build timer
  let _buildTimer = 0;
  const BUILD_DURATION = 3.5;

  // Dust
  let _dustMesh = null;

  // Scaffold
  let _scaffoldGroup = null;

  // Reveal
  let _revealTimer = 0;
  const REVEAL_DURATION = 1.0;
  let _scaffoldFadeTimer = 0;
  const SCAFFOLD_FADE_DURATION = 0.9;

  // API refine promise
  let _refinePromise = null;

  // Callbacks
  let _onComplete = null;

  // --- helper: compute building bounds ---
  function _getBuildingBounds() {
    const box = new THREE.Box3().setFromObject(_building.mesh);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    return { size, center, box };
  }

  // --- helper: compute waypoints ---
  function _computeWaypoints(center, size) {
    const radius = Math.max(size.x, size.z) * 0.5 + 3.0;
    const count = 8;
    const wps = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      wps.push({
        x: center.x + Math.cos(angle) * radius,
        z: center.z + Math.sin(angle) * radius,
      });
    }
    return wps;
  }

  // --- dust particle system ---
  function _createDust() {
    const { center, size } = _getBuildingBounds();
    const count = 80;
    const geo = new THREE.SphereGeometry(0.08, 4, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xccc8b0,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.userData = {
      velocities: [],
      lifetimes: [],
      maxLifetime: 2.0,
      center: center.clone(),
      halfSize: new THREE.Vector3(size.x * 0.5, size.y * 0.5, size.z * 0.5),
    };
    mesh.count = 0; // active count
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      dummy.scale.setScalar(0);
      dummy.position.set(0, -999, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.userData.velocities.push({ x: 0, y: 0, z: 0 });
      mesh.userData.lifetimes.push(0);
    }
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    _dustMesh = mesh;
  }

  function _spawnDustBurst(yOffset, spreadY, count) {
    if (!_dustMesh) return;
    const ud = _dustMesh.userData;
    const dummy = new THREE.Object3D();
    let spawned = 0;
    for (let i = 0; i < _dustMesh.userData.lifetimes.length && spawned < count; i++) {
      if (ud.lifetimes[i] <= 0) {
        const angle = Math.random() * Math.PI * 2;
        const r = (Math.random() * ud.halfSize.x * 0.9);
        dummy.position.set(
          ud.center.x + Math.cos(angle) * r,
          ud.center.y + yOffset + Math.random() * spreadY,
          ud.center.z + Math.sin(angle) * r
        );
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        _dustMesh.setMatrixAt(i, dummy.matrix);
        ud.velocities[i] = {
          x: (Math.random() - 0.5) * 0.6,
          y: 0.3 + Math.random() * 0.5,
          z: (Math.random() - 0.5) * 0.6,
        };
        ud.lifetimes[i] = 1.0 + Math.random() * 1.0;
        spawned++;
      }
    }
    _dustMesh.count = Math.max(_dustMesh.count || 0, spawned);
    _dustMesh.instanceMatrix.needsUpdate = true;
  }

  function _updateDust(dt) {
    if (!_dustMesh) return;
    const ud = _dustMesh.userData;
    const dummy = new THREE.Object3D();
    let active = 0;
    for (let i = 0; i < ud.lifetimes.length; i++) {
      if (ud.lifetimes[i] > 0) {
        ud.lifetimes[i] -= dt;
        ud.velocities[i].y -= 0.3 * dt; // gravity
        _dustMesh.getMatrixAt(i, dummy.matrix);
        dummy.position.x += ud.velocities[i].x * dt;
        dummy.position.y += ud.velocities[i].y * dt;
        dummy.position.z += ud.velocities[i].z * dt;
        // Scale fade
        const lifeRatio = Math.max(0, ud.lifetimes[i] / (ud.maxLifetime || 2.0));
        const s = lifeRatio < 0.3 ? lifeRatio / 0.3 : 1;
        dummy.scale.setScalar(Math.max(0, s));
        if (ud.lifetimes[i] <= 0) {
          dummy.scale.setScalar(0);
          dummy.position.y = -999;
        }
        dummy.updateMatrix();
        _dustMesh.setMatrixAt(i, dummy.matrix);
        if (ud.lifetimes[i] > 0) active++;
      } else {
        // Ensure hidden
        dummy.scale.setScalar(0);
        dummy.position.set(0, -999, 0);
        dummy.updateMatrix();
        _dustMesh.setMatrixAt(i, dummy.matrix);
      }
    }
    _dustMesh.count = active;
    _dustMesh.instanceMatrix.needsUpdate = true;
    _dustMesh.material.opacity = 0.75;
    _dustMesh.visible = active > 0;
  }

  function _disposeDust() {
    if (_dustMesh) {
      scene.remove(_dustMesh);
      _dustMesh.geometry.dispose();
      _dustMesh.material.dispose();
      _dustMesh = null;
    }
  }

  // --- scaffold ---
  function _createScaffold() {
    const { size, center } = _getBuildingBounds();
    const scaffoldGroup = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xc28a45,
      roughness: 0.9,
      flatShading: true,
      transparent: true,
      opacity: 0.8,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x2a2330,
      roughness: 0.9,
      flatShading: true,
      transparent: true,
      opacity: 0.7,
    });

    const ew = 0.15; // edge width
    const hw = size.x / 2 + 0.3;
    const hh = size.y / 2 + 0.2;
    const hd = size.z / 2 + 0.3;

    // 4 vertical poles
    const verts = [[-hw, 0, -hd], [hw, 0, -hd], [-hw, 0, hd], [hw, 0, hd]];
    for (const [vx, vy, vz] of verts) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(ew, size.y + 0.5, ew), mat);
      pole.position.set(vx, vy + hh, vz);
      scaffoldGroup.add(pole);
    }

    // Rails at 3 levels
    const levels = [size.y * 0.25, size.y * 0.55, size.y * 0.85];
    for (const ly of levels) {
      // Front/back rails
      for (const z of [-hd, hd]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(size.x + 0.6, ew, ew), darkMat);
        rail.position.set(0, ly, z);
        scaffoldGroup.add(rail);
      }
      // Left/right rails
      for (const x of [-hw, hw]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(ew, ew, size.z + 0.6), darkMat);
        rail.position.set(x, ly, 0);
        scaffoldGroup.add(rail);
      }
    }

    // Position scaffold to match building
    scaffoldGroup.position.set(
      _building.mesh.position.x + center.x,
      _building.mesh.position.y,
      _building.mesh.position.z + center.z
    );

    scene.add(scaffoldGroup);
    _scaffoldGroup = scaffoldGroup;
    _scaffoldGroup.userData = { materials: [] };
    scaffoldGroup.traverse(c => {
      if (c.material && c.material.transparent) {
        _scaffoldGroup.userData.materials.push(c.material);
      }
    });
  }

  function _disposeScaffold() {
    if (_scaffoldGroup) {
      scene.remove(_scaffoldGroup);
      _scaffoldGroup.traverse(c => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
      _scaffoldGroup = null;
    }
  }

  function _updateScaffoldFade(dt) {
    if (!_scaffoldGroup) return;
    _scaffoldFadeTimer += dt;
    const t = Math.min(_scaffoldFadeTimer / SCAFFOLD_FADE_DURATION, 1);
    // Cubic ease-in: sink + fade
    const ease = 1 - Math.pow(1 - t, 3);
    _scaffoldGroup.position.y += -3.2 * dt / SCAFFOLD_FADE_DURATION;
    for (const m of _scaffoldGroup.userData.materials || []) {
      m.opacity = Math.max(0, 0.8 * (1 - ease));
    }
    if (t >= 1) {
      _disposeScaffold();
    }
  }

  // --- reveal ---
  function _revealNewModel(dt) {
    _revealTimer += dt;
    const t = Math.min(_revealTimer / REVEAL_DURATION, 1);
    const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
    const s = 0.82 + (1 - 0.82) * ease;

    if (_newModelGroup) {
      _newModelGroup.scale.setScalar(s);
      // Rotation wiggle
      _newModelGroup.rotation.y = Math.sin((1 - t) * Math.PI) * 0.035;
    }

    if (t >= 1) {
      // Finalize
      if (_newModelGroup && _building) {
        _newModelGroup.scale.setScalar(1);
        _newModelGroup.rotation.y = 0;
        _building.replaceModel(_newModelGroup, _newModelJson);
        _newModelGroup = null;
      }
      _state = STATE.IDLE;
      if (_onComplete) _onComplete();
    }
  }

  // --- public API ---

  function start(buildingEntity, playerDescription) {
    if (_state !== STATE.IDLE) return;
    _building = buildingEntity;
    _description = playerDescription;
    _newModelJson = null;
    _newModelGroup = null;

    const { center, size } = _getBuildingBounds();
    const worldCenter = new THREE.Vector3(
      buildingEntity.mesh.position.x + center.x,
      buildingEntity.mesh.position.y + center.y,
      buildingEntity.mesh.position.z + center.z
    );

    _waypoints = _computeWaypoints(worldCenter, size);
    _wpIndex = 0;

    // Start walking to first waypoint
    _state = STATE.WALKING;
    architect.walkTo(_waypoints[0].x, _waypoints[0].z, 3.0);

    // Create dust + scaffold immediately
    _createDust();
    _createScaffold();

    console.log('[ConstructionEffect] Started for:', buildingEntity.name);
  }

  function update(dt) {
    dt = Math.min(dt, 0.05);
    if (_state === STATE.IDLE) return;

    // Always update dust while active
    _updateDust(dt);

    if (_state === STATE.WALKING) {
      // Check if architect reached waypoint
      if (!architect._targetPosition) {
        _wpIndex++;
        if (_wpIndex < _waypoints.length) {
          architect.walkTo(_waypoints[_wpIndex].x, _waypoints[_wpIndex].z, 3.0);
        } else {
          // Done walking — start building
          const { center } = _getBuildingBounds();
          const worldCenterX = _building.mesh.position.x + center.x;
          const worldCenterZ = _building.mesh.position.z + center.z;
          architect.stopWalking();
          architect.lockFacing(worldCenterX, worldCenterZ);
          architect.playAnimation('construct');
          _buildTimer = 0;
          _state = STATE.BUILDING;
        }
      }
    }

    if (_state === STATE.BUILDING) {
      _buildTimer += dt;

      // Dust bursts
      if (_buildTimer > 0.05 && _buildTimer < 0.15) {
        _spawnDustBurst(0.15, 1.5, 40);
      }
      if (_buildTimer > 2.0 && _buildTimer < 2.15) {
        _spawnDustBurst(0.4, 2.0, 30);
      }

      if (_buildTimer >= BUILD_DURATION) {
        // Fire API refine
        _state = STATE.API_REFINE;
        _refinePromise = _doRefine();
      }
    }

    if (_state === STATE.API_REFINE) {
      // Check if API call completed
      if (_refinePromise) {
        _refinePromise.then(result => {
          _newModelJson = result;
          _refinePromise = null;
          // Walk back to origin
          architect.unlockFacing();
          architect.walkTo(
            architect._originPosition.x,
            architect._originPosition.z,
            3.5
          );
          _state = STATE.RETURNING;
        }).catch(err => {
          console.warn('[ConstructionEffect] Refine failed:', err.message);
          _refinePromise = null;
          // Still return — use fallback scale pulse
          architect.unlockFacing();
          architect.walkTo(
            architect._originPosition.x,
            architect._originPosition.z,
            3.5
          );
          _state = STATE.RETURNING;
        });
      }
    }

    if (_state === STATE.RETURNING) {
      if (!architect._targetPosition) {
        architect.stopWalking();
        architect.playAnimation('idle');
        // Start scaffold fade
        _scaffoldFadeTimer = 0;
        _state = STATE.SCAFFOLD_FADE;
      }
    }

    if (_state === STATE.SCAFFOLD_FADE) {
      _updateScaffoldFade(dt);
      if (_scaffoldFadeTimer >= SCAFFOLD_FADE_DURATION) {
        _revealTimer = 0;
        // Build new model
        if (_newModelJson) {
          try {
            _newModelGroup = buildModelFromJson(_newModelJson);
            if (_newModelGroup) {
              // Ground-align
              const box = new THREE.Box3().setFromObject(_newModelGroup);
              _newModelGroup.position.y = -box.min.y;
              _building.mesh.add(_newModelGroup);
            }
          } catch (e) {
            console.warn('[ConstructionEffect] New model build failed:', e.message);
          }
        }
        _state = STATE.REVEAL;
      }
    }

    if (_state === STATE.REVEAL) {
      _revealNewModel(dt);
    }
  }

  async function _doRefine() {
    try {
      const modelJson = _building._originalModelJson;
      if (!modelJson) throw new Error('No original model JSON on building');
      const result = await contentPort.refineModel({ modelJson, description: _description });
      return result;
    } catch (e) {
      console.warn('[ConstructionEffect] API refine failed, using fallback:', e.message);
      // Fallback: return a modified copy of original
      return _building._originalModelJson || null;
    }
  }

  function isActive() {
    return _state !== STATE.IDLE;
  }

  function dispose() {
    _disposeDust();
    _disposeScaffold();
    _state = STATE.IDLE;
  }

  // Callback when construction+reveal completes
  Object.defineProperty({}, 'onComplete', {
    get: () => _onComplete,
    set: (fn) => { _onComplete = fn; },
  });

  return {
    start,
    update,
    isActive,
    dispose,
    get onComplete() { return _onComplete; },
    set onComplete(fn) { _onComplete = fn; },
  };
}
