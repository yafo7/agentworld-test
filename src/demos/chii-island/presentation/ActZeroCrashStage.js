import * as THREE from 'three';
import {
  applyCinematicCameraShake,
  CINEMATIC_SHAKE_IDS,
  CINEMATIC_SHOT_IDS,
  createCinematicCameraPose,
} from './cinematic/CinematicTemplateLibrary.js';

const HELICOPTER_COLORS = Object.freeze({
  shell: 0x52636a,
  shellDark: 0x27343a,
  exposed: 0x24282d,
  interior: 0x718187,
  seat: 0xc6533f,
  seatFrame: 0x303238,
  belt: 0xe4c98a,
  panel: 0x182126,
  glass: 0x93c7d7,
  warning: 0xff5b42,
});

const PLAYER_SEAT_POSITION = new THREE.Vector3(-1.2, 0.3, 1.55);
const BOSS_SEAT_POSITION = new THREE.Vector3(-1.2, 0.78, -1.3);
const FALL_CAMERA_EJECTION_OFFSET = new THREE.Vector3(1.8, 8, 5.5);
const FALL_CAMERA_TRACK_OFFSET = new THREE.Vector3(-5.8, 2.7, 7.5);
const FALL_CAMERA_IMPACT_OFFSET = new THREE.Vector3(-4.4, 2.4, 6.2);

function addBox(parent, name, size, position, material, rotation = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, name, radius, length, position, material, rotation = null, sides = 10) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, sides),
    material,
  );
  mesh.name = name;
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function createSeat(parent, index, x, z, {
  damaged = false,
  rotationY = 0,
} = {}) {
  const root = new THREE.Group();
  root.name = `cabin_seat_${index}`;
  root.position.set(x, 0.48, z);
  root.rotation.y = rotationY;
  if (damaged) root.rotation.set(0.08, rotationY - 0.18, -0.22);
  parent.add(root);

  addBox(root, `seat_${index}_cushion`, [1.05, 0.28, 0.92], [0, 0.62, 0], parent.userData.materials.seat);
  addBox(root, `seat_${index}_back`, [1.05, 1.28, 0.24], [0, 1.28, 0.36], parent.userData.materials.seat);
  addBox(root, `seat_${index}_headrest`, [0.72, 0.36, 0.28], [0, 2.02, 0.36], parent.userData.materials.seat);
  addBox(
    root,
    `seat_${index}_belt_left`,
    [0.08, 0.92, 0.05],
    [-0.24, 1.28, 0.18],
    parent.userData.materials.belt,
    [0, 0, -0.28],
  );
  addBox(
    root,
    `seat_${index}_belt_right`,
    [0.08, 0.92, 0.05],
    [0.24, 1.28, 0.18],
    parent.userData.materials.belt,
    [0, 0, 0.28],
  );
  addBox(root, `seat_${index}_lap_belt`, [0.72, 0.08, 0.06], [0, 0.83, -0.08], parent.userData.materials.belt);
  for (const side of [-1, 1]) {
    addBox(
      root,
      `seat_${index}_leg_${side}`,
      [0.12, 0.65, 0.12],
      [side * 0.37, 0.22, 0.18],
      parent.userData.materials.seatFrame,
    );
  }
  return root;
}

export function createDamagedHelicopter() {
  const root = new THREE.Group();
  root.name = 'ActZeroDamagedHelicopter';

  const materials = {
    shell: new THREE.MeshStandardMaterial({ color: HELICOPTER_COLORS.shell, roughness: 0.76, metalness: 0.1 }),
    shellDark: new THREE.MeshStandardMaterial({ color: HELICOPTER_COLORS.shellDark, roughness: 0.82 }),
    exposed: new THREE.MeshStandardMaterial({ color: HELICOPTER_COLORS.exposed, roughness: 0.9 }),
    interior: new THREE.MeshStandardMaterial({ color: HELICOPTER_COLORS.interior, roughness: 0.88 }),
    seat: new THREE.MeshStandardMaterial({ color: HELICOPTER_COLORS.seat, roughness: 0.9 }),
    seatFrame: new THREE.MeshStandardMaterial({ color: HELICOPTER_COLORS.seatFrame, roughness: 0.7, metalness: 0.35 }),
    belt: new THREE.MeshStandardMaterial({ color: HELICOPTER_COLORS.belt, roughness: 0.82 }),
    panel: new THREE.MeshStandardMaterial({ color: HELICOPTER_COLORS.panel, roughness: 0.72, metalness: 0.18 }),
    glass: new THREE.MeshStandardMaterial({
      color: HELICOPTER_COLORS.glass,
      roughness: 0.28,
      transparent: true,
      opacity: 0.58,
      side: THREE.DoubleSide,
    }),
    warning: new THREE.MeshStandardMaterial({
      color: HELICOPTER_COLORS.warning,
      emissive: 0xff2d1a,
      emissiveIntensity: 1.2,
      roughness: 0.4,
    }),
  };
  root.userData.materials = materials;
  root.userData.damageOpening = {
    side: 'starboard',
    min: new THREE.Vector3(2.36, 0.75, -1.75),
    max: new THREE.Vector3(2.62, 4.5, 2.0),
  };

  const shell = new THREE.Group();
  shell.name = 'helicopter_shell';
  root.add(shell);

  addBox(shell, 'cabin_floor', [5, 0.42, 10], [0, 0.2, 0], materials.shellDark);
  addBox(shell, 'port_wall_lower', [0.28, 1.1, 9.4], [-2.48, 0.75, 0], materials.shell);
  addBox(shell, 'port_wall_upper', [0.28, 0.72, 9.4], [-2.48, 3.82, 0], materials.shell);
  for (const z of [-4.65, -2.3, 0, 2.3, 4.65]) {
    addBox(shell, `port_window_frame_${z}`, [0.3, 2.15, 0.18], [-2.48, 2.28, z], materials.shellDark);
  }
  for (const [index, z] of [-3.48, -1.15, 1.15, 3.48].entries()) {
    addBox(shell, `port_window_${index + 1}`, [0.12, 1.82, 2.05], [-2.49, 2.32, z], materials.glass);
  }
  addBox(shell, 'starboard_wall_front', [0.28, 3.9, 2.6], [2.48, 2.15, -3.4], materials.shell);
  addBox(shell, 'starboard_wall_rear', [0.28, 3.9, 2.35], [2.48, 2.15, 3.55], materials.shell);
  addBox(shell, 'rear_bulkhead', [5, 3.9, 0.28], [0, 2.15, 4.85], materials.shell);
  addBox(shell, 'roof_port', [2.35, 0.28, 9.4], [-1.32, 4.17, 0], materials.shell);
  addBox(shell, 'roof_starboard_front', [2.15, 0.28, 2.7], [1.42, 4.17, -3.35], materials.shell);
  addBox(shell, 'roof_starboard_rear', [2.15, 0.28, 2.3], [1.42, 4.17, 3.55], materials.shell);

  const cockpit = new THREE.Group();
  cockpit.name = 'cockpit';
  cockpit.position.z = -5.55;
  root.add(cockpit);
  addBox(cockpit, 'cockpit_floor', [4.65, 0.42, 2.1], [0, 0.25, 0], materials.shellDark);
  addBox(cockpit, 'cockpit_nose', [4.1, 1.2, 0.6], [0, 1.05, -1.05], materials.shell);
  addBox(cockpit, 'cockpit_glass_front', [3.9, 1.7, 0.16], [0, 2.55, -1.14], materials.glass, [-0.24, 0, 0]);
  addBox(cockpit, 'cockpit_glass_port', [0.16, 1.65, 1.65], [-2.12, 2.48, -0.2], materials.glass, [0, 0.12, 0]);
  addBox(cockpit, 'cockpit_glass_starboard', [0.16, 1.65, 1.65], [2.12, 2.48, -0.2], materials.glass, [0, -0.12, 0]);

  const seats = new THREE.Group();
  seats.name = 'helicopter_seats';
  seats.userData.materials = materials;
  root.add(seats);
  createSeat(seats, 1, -1.2, -1.3, { rotationY: Math.PI });
  createSeat(seats, 2, 1.2, -1.3, { damaged: true, rotationY: Math.PI });
  createSeat(seats, 3, -1.2, 1.55);
  createSeat(seats, 4, 1.2, 1.55);
  createSeat(seats, 5, -1.15, -5.3);
  createSeat(seats, 6, 1.15, -5.3);

  const cabinInterior = new THREE.Group();
  cabinInterior.name = 'cabin_interior_details';
  root.add(cabinInterior);
  addBox(cabinInterior, 'aisle_left_rail', [0.1, 0.035, 7.8], [-0.42, 0.44, 0.2], materials.interior);
  addBox(cabinInterior, 'aisle_right_rail', [0.1, 0.035, 7.8], [0.42, 0.44, 0.2], materials.interior);
  addCylinder(
    cabinInterior,
    'overhead_grab_rail',
    0.055,
    6.8,
    [0, 3.72, 0.4],
    materials.exposed,
    [Math.PI / 2, 0, 0],
    8,
  );
  for (const z of [-2.3, 0, 2.3]) {
    addCylinder(
      cabinInterior,
      `overhead_grab_${z}`,
      0.045,
      1.0,
      [0, 3.25, z],
      materials.exposed,
      [0, 0, Math.PI / 2],
      8,
    );
  }
  addBox(cabinInterior, 'rear_control_panel', [2.9, 1.1, 0.16], [0, 2.32, 4.68], materials.panel);
  for (let index = 0; index < 5; index += 1) {
    addBox(
      cabinInterior,
      `rear_panel_indicator_${index}`,
      [0.16, 0.12, 0.04],
      [-0.65 + index * 0.32, 2.52, 4.57],
      index % 2 ? materials.warning : materials.belt,
    );
  }

  const tail = new THREE.Group();
  tail.name = 'tail_assembly';
  root.add(tail);
  addBox(tail, 'tail_boom', [1.2, 1.25, 7.2], [0, 2.55, 8.3], materials.shellDark, [0.08, 0, 0]);
  addBox(tail, 'tail_fin', [0.26, 2.9, 1.4], [0, 3.85, 11.35], materials.shell);

  const rotor = new THREE.Group();
  rotor.name = 'main_rotor';
  rotor.position.set(0, 4.75, 0);
  root.add(rotor);
  addCylinder(rotor, 'main_rotor_hub', 0.26, 0.75, [0, 0, 0], materials.exposed);
  addBox(rotor, 'main_rotor_blade_x', [14, 0.12, 0.28], [0, 0.42, 0], materials.shellDark);
  addBox(rotor, 'main_rotor_blade_z', [0.28, 0.12, 14], [0, 0.42, 0], materials.shellDark);

  const tailRotor = new THREE.Group();
  tailRotor.name = 'tail_rotor';
  tailRotor.position.set(0.72, 3.25, 11.75);
  root.add(tailRotor);
  addCylinder(tailRotor, 'tail_rotor_hub', 0.18, 0.55, [0, 0, 0], materials.exposed, [0, 0, Math.PI / 2]);
  addBox(tailRotor, 'tail_rotor_blade_a', [0.1, 2.8, 0.24], [0.32, 0, 0], materials.shellDark, [0, 0, 0.55]);
  addBox(tailRotor, 'tail_rotor_blade_b', [0.1, 2.8, 0.24], [0.32, 0, 0], materials.shellDark, [0, 0, -0.95]);

  for (const x of [-1.75, 1.75]) {
    addCylinder(root, `landing_skid_${x}`, 0.1, 8.2, [x, -0.42, 0.25], materials.exposed, [Math.PI / 2, 0, 0]);
    for (const z of [-2.1, 2.1]) {
      addCylinder(root, `skid_support_${x}_${z}`, 0.08, 1.05, [x, 0, z], materials.exposed, [0, 0, x < 0 ? -0.48 : 0.48]);
    }
  }

  const damage = new THREE.Group();
  damage.name = 'breach_damage';
  root.add(damage);
  const fractureSpecs = [
    [2.58, 0.72, -1.7, 0.12, 0.75, 0.18, 0.1],
    [2.58, 1.45, -1.76, 0.16, 0.82, 0.18, -0.3],
    [2.58, 2.3, -1.72, 0.14, 0.9, 0.18, 0.2],
    [2.58, 3.25, -1.68, 0.18, 1.0, 0.18, -0.24],
    [2.58, 0.78, 1.98, 0.14, 0.85, 0.18, -0.14],
    [2.58, 1.7, 2.03, 0.18, 0.95, 0.18, 0.3],
    [2.58, 2.75, 1.98, 0.14, 1.08, 0.18, -0.2],
    [2.58, 3.72, 1.84, 0.16, 0.78, 0.18, 0.35],
    [1.95, 4.22, -1.18, 1.0, 0.15, 0.2, 0.18],
    [1.15, 4.22, -0.25, 0.95, 0.15, 0.2, -0.3],
    [1.55, 4.22, 1.28, 0.9, 0.15, 0.2, 0.24],
  ];
  fractureSpecs.forEach((spec, index) => {
    const [x, y, z, sx, sy, sz, rz] = spec;
    addBox(
      damage,
      `fractured_frame_${index}`,
      [sx, sy, sz],
      [x, y, z],
      materials.exposed,
      [0.15 * Math.sin(index), 0.2 * Math.cos(index), rz],
    );
  });

  const debris = new THREE.Group();
  debris.name = 'loose_debris';
  root.add(debris);
  for (let index = 0; index < 10; index += 1) {
    const panel = addBox(
      debris,
      `loose_panel_${index}`,
      [0.18 + (index % 3) * 0.08, 0.1 + (index % 2) * 0.06, 0.35 + (index % 4) * 0.12],
      [
        1.8 + (index % 3) * 0.28,
        0.9 + (index % 5) * 0.58,
        -1.35 + (index % 6) * 0.58,
      ],
      index % 2 ? materials.shell : materials.exposed,
      [index * 0.17, index * 0.11, index * 0.23],
    );
    panel.userData.velocity = new THREE.Vector3(
      0.35 + (index % 3) * 0.16,
      0.1 + (index % 4) * 0.08,
      -0.18 + (index % 5) * 0.08,
    );
    panel.userData.basePosition = panel.position.clone();
  }

  const warningLight = new THREE.PointLight(HELICOPTER_COLORS.warning, 3.5, 12, 2);
  warningLight.name = 'cabin_warning_light';
  warningLight.position.set(-1.8, 3.65, 1.8);
  root.add(warningLight);
  addBox(root, 'warning_light_fixture', [0.36, 0.15, 0.36], [-1.8, 4.02, 1.8], materials.warning);

  root.userData.refs = { rotor, tailRotor, debris, warningLight, seats, damage };
  return root;
}

function createOcean() {
  const material = new THREE.MeshStandardMaterial({
    color: 0x163d58,
    roughness: 0.36,
    metalness: 0.05,
    transparent: true,
    opacity: 0.94,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(600, 600, 1, 1), material);
  mesh.name = 'ActZeroOcean';
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

function createCloudLayer() {
  const root = new THREE.Group();
  root.name = 'ActZeroCloudLayer';
  const material = new THREE.MeshStandardMaterial({
    color: 0x9aaeb8,
    transparent: true,
    opacity: 0.38,
    roughness: 1,
    depthWrite: false,
  });
  for (let index = 0; index < 18; index += 1) {
    const cloud = new THREE.Mesh(
      new THREE.DodecahedronGeometry(4 + (index % 4) * 1.4, 0),
      material,
    );
    const angle = index * 2.399;
    const radius = 22 + (index % 6) * 8;
    cloud.position.set(Math.cos(angle) * radius, -20 - (index % 5) * 10, Math.sin(angle) * radius);
    cloud.scale.set(1.8, 0.55 + (index % 3) * 0.16, 1);
    root.add(cloud);
  }
  root.userData.material = material;
  return root;
}

function createWindLines() {
  const root = new THREE.Group();
  root.name = 'ActZeroWindLines';
  const material = new THREE.MeshBasicMaterial({
    color: 0xd9f3ff,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
  });
  for (let index = 0; index < 32; index += 1) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.035, 2.5 + (index % 5), 0.035), material);
    line.position.set(
      -12 + ((index * 37) % 240) / 10,
      -16 + ((index * 53) % 320) / 10,
      -8 + ((index * 29) % 180) / 10,
    );
    root.add(line);
  }
  root.visible = false;
  root.userData.material = material;
  return root;
}

function createCabinSuctionLines() {
  const root = new THREE.Group();
  root.name = 'ActZeroCabinSuctionLines';
  const material = new THREE.MeshBasicMaterial({
    color: 0xe6f7ff,
    transparent: true,
    opacity: 0.64,
    depthWrite: false,
  });
  for (let index = 0; index < 18; index += 1) {
    const length = 0.45 + (index % 4) * 0.18;
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(length, 0.025, 0.025),
      material,
    );
    line.name = `ActZeroCabinSuctionLine_${index + 1}`;
    line.position.set(
      -2.1 + (index % 6) * 0.72,
      0.85 + (index % 5) * 0.58,
      -1.55 + (index % 7) * 0.5,
    );
    line.userData.speed = 4.2 + (index % 5) * 0.8;
    root.add(line);
  }
  root.visible = false;
  root.userData.material = material;
  return root;
}

function createSplash() {
  const root = new THREE.Group();
  root.name = 'ActZeroSplash';
  const material = new THREE.MeshBasicMaterial({
    color: 0xbcecff,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.1, 8, 32), material);
  ring.rotation.x = Math.PI / 2;
  root.add(ring);
  for (let index = 0; index < 18; index += 1) {
    const drop = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), material);
    const angle = (index / 18) * Math.PI * 2;
    drop.position.set(Math.cos(angle) * 0.8, 0.25, Math.sin(angle) * 0.8);
    drop.userData.angle = angle;
    root.add(drop);
  }
  root.visible = false;
  root.userData.material = material;
  return root;
}

function createWaterRipples() {
  const root = new THREE.Group();
  root.name = 'ActZeroWaterRipples';
  for (let index = 0; index < 5; index += 1) {
    const material = new THREE.LineBasicMaterial({
      color: index % 2 === 0 ? 0xc9f3ff : 0x7bc9ea,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const points = [];
    for (let pointIndex = 0; pointIndex < 96; pointIndex += 1) {
      const angle = (pointIndex / 96) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(angle) * 0.9, 0, Math.sin(angle) * 0.9));
    }
    const ripple = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(points),
      material,
    );
    ripple.name = `ActZeroWaterRipple_${index + 1}`;
    ripple.position.y = index * 0.004;
    ripple.userData.phaseOffset = index / 5;
    root.add(ripple);
  }
  root.visible = false;
  return root;
}

function clonePlayerProxy(playerMesh) {
  const proxy = new THREE.Group();
  proxy.name = 'ActZeroPlayerProxy';
  const visual = playerMesh?.clone?.(true) || new THREE.Group();
  visual.name = 'ActZeroPlayerVisual';
  visual.position.set(0, 0, 0);
  visual.rotation.set(0, 0, 0);
  visual.updateMatrixWorld(true);
  const initialBounds = new THREE.Box3().setFromObject(visual);
  const initialHeight = initialBounds.max.y - initialBounds.min.y;
  if (Number.isFinite(initialHeight) && initialHeight > 0.01) {
    visual.scale.multiplyScalar(2.15 / initialHeight);
    visual.updateMatrixWorld(true);
    const normalizedBounds = new THREE.Box3().setFromObject(visual);
    const center = normalizedBounds.getCenter(new THREE.Vector3());
    visual.position.x -= center.x;
    visual.position.y -= normalizedBounds.min.y;
    visual.position.z -= center.z;
  }
  proxy.add(visual);
  proxy.position.copy(PLAYER_SEAT_POSITION);
  proxy.rotation.y = Math.PI;
  proxy.visible = false;
  proxy.userData.visual = visual;
  return proxy;
}

function lerpVector(from, to, t) {
  return from.clone().lerp(to, THREE.MathUtils.clamp(t, 0, 1));
}

function faceTowardOnY(object, target) {
  const dx = target.x - object.position.x;
  const dz = target.z - object.position.z;
  if (Math.abs(dx) + Math.abs(dz) < 0.0001) return;
  object.rotation.set(0, Math.atan2(dx, dz), 0);
}

export class ActZeroCrashStage {
  constructor({ playerMesh = null } = {}) {
    this.root = new THREE.Group();
    this.root.name = 'ActZeroCrashStage';
    this.elapsed = 0;
    this.phase = 'prelude';
    this.progress = 0;

    this.helicopter = createDamagedHelicopter();
    this.root.add(this.helicopter);

    this.playerProxy = clonePlayerProxy(playerMesh);
    this.helicopter.add(this.playerProxy);

    this.bossAnchor = new THREE.Group();
    this.bossAnchor.name = 'ActZeroBossAnchor';
    this.bossAnchor.position.copy(BOSS_SEAT_POSITION);
    this.helicopter.add(this.bossAnchor);

    this.angelAnchor = new THREE.Group();
    this.angelAnchor.name = 'ActZeroAngelAnchor';
    this.angelAnchor.position.set(5.6, 1.1, 0.3);
    this.helicopter.add(this.angelAnchor);
    this.fallStartPlayerPosition = new THREE.Vector3();
    this.fallStartAngelPosition = new THREE.Vector3();

    this.ocean = createOcean();
    this.ocean.position.y = -100;
    this.root.add(this.ocean);

    this.clouds = createCloudLayer();
    this.root.add(this.clouds);

    this.windLines = createWindLines();
    this.root.add(this.windLines);

    this.cabinSuctionLines = createCabinSuctionLines();
    this.helicopter.add(this.cabinSuctionLines);

    this.splash = createSplash();
    this.splash.position.y = 0.05;
    this.root.add(this.splash);

    this.waterRipples = createWaterRipples();
    this.waterRipples.position.y = -0.44;
    this.root.add(this.waterRipples);

    const hemi = new THREE.HemisphereLight(0xb7d9e8, 0x14202b, 1.15);
    hemi.name = 'ActZeroHemisphereLight';
    this.root.add(hemi);
    const key = new THREE.DirectionalLight(0xe8f4ff, 2.1);
    key.name = 'ActZeroKeyLight';
    key.position.set(-12, 18, 10);
    this.root.add(key);

    this.root.visible = false;
  }

  attachAngel(actorRoot) {
    this.angelAnchor.clear();
    this.angelAnchor.add(actorRoot);
  }

  attachPlayer(actorRoot) {
    this.playerProxy.clear();
    this.playerProxy.add(actorRoot);
  }

  attachBoss(actorRoot) {
    this.bossAnchor.clear();
    this.bossAnchor.add(actorRoot);
  }

  setPhase(phase, progress = 0) {
    if (phase !== this.phase && phase === 'free_fall') {
      this.root.attach(this.playerProxy);
      this.root.attach(this.angelAnchor);
      this.fallStartPlayerPosition.copy(this.playerProxy.position);
      this.fallStartAngelPosition.copy(this.angelAnchor.position);
    }
    this.phase = phase;
    this.progress = THREE.MathUtils.clamp(progress, 0, 1);
  }

  update(dt) {
    this.elapsed += dt;
    const refs = this.helicopter.userData.refs;
    refs.rotor.rotation.y += dt * 22;
    refs.tailRotor.rotation.x += dt * 31;
    refs.warningLight.intensity = 2.2 + Math.max(0, Math.sin(this.elapsed * 8)) * 3.2;

    const shake = ['free_fall', 'impact', 'iris_focus', 'final_black'].includes(this.phase)
      ? 0
      : ['boss_ejection', 'ejection'].includes(this.phase)
        ? 0.105
        : ['cabin_two_shot', 'boss_warning', 'player_silence'].includes(this.phase)
          ? 0.065
          : 0.045;
    this.helicopter.position.x = Math.sin(this.elapsed * 15.7) * shake;
    this.helicopter.position.y = Math.sin(this.elapsed * 19.3) * shake * 0.55;
    this.helicopter.rotation.z = -0.05 + Math.sin(this.elapsed * 4.2) * shake * 0.45;
    this.helicopter.rotation.x = Math.sin(this.elapsed * 3.1) * shake * 0.25;

    refs.debris.children.forEach((panel, index) => {
      panel.rotation.x += dt * (0.5 + index * 0.08);
      panel.rotation.z += dt * (0.7 + index * 0.06);
    });

    this.windLines.visible = ['boss_ejection', 'ejection', 'free_fall'].includes(this.phase);
    if (this.windLines.visible) {
      for (const line of this.windLines.children) {
        line.position.y += dt * 30;
        if (line.position.y > 18) line.position.y -= 38;
      }
    }

    this.cabinSuctionLines.visible = this.phase === 'boss_ejection' || this.phase === 'ejection';
    if (this.cabinSuctionLines.visible) {
      for (const line of this.cabinSuctionLines.children) {
        line.position.x += dt * line.userData.speed;
        if (line.position.x > 2.7) line.position.x -= 4.9;
      }
    }

    this._updatePhase();
  }

  _updatePhase() {
    const p = this.progress;
    const earlyCabinPhases = [
      'prelude',
      'boss_reveal',
      'head_shake',
      'cabin_two_shot',
      'boss_warning',
      'player_silence',
    ];
    const playerCabinPhases = [
      'cabin_two_shot',
      'boss_warning',
      'player_silence',
      'angel_arrival',
      'wish',
      'ack',
      'generating',
      'ejection',
    ];
    const angelPhases = [
      'angel_arrival',
      'wish',
      'ack',
      'generating',
      'ejection',
      'free_fall',
      'impact',
    ];

    this.helicopter.visible = !['impact', 'iris_focus', 'final_black'].includes(this.phase);
    this.clouds.visible = !['iris_focus', 'final_black'].includes(this.phase);
    this.playerProxy.visible = playerCabinPhases.includes(this.phase) || this.phase === 'free_fall' || this.phase === 'impact';
    this.bossAnchor.visible = earlyCabinPhases.includes(this.phase)
      || (this.phase === 'boss_ejection' && p < 0.98);
    this.angelAnchor.visible = angelPhases.includes(this.phase)
      && !(this.phase === 'impact' && p >= 0.25);
    this.splash.visible = this.phase === 'impact';
    this.waterRipples.visible = this.phase === 'iris_focus' || this.phase === 'final_black';

    if (earlyCabinPhases.includes(this.phase) || [
      'boss_ejection',
      'angel_arrival',
      'wish',
      'ack',
      'generating',
      'ejection',
    ].includes(this.phase)) {
      this.helicopter.scale.setScalar(1);
      this.playerProxy.position.copy(PLAYER_SEAT_POSITION);
      this.playerProxy.rotation.set(0, Math.PI, 0);
    }

    if (earlyCabinPhases.includes(this.phase)) {
      this.bossAnchor.position.copy(BOSS_SEAT_POSITION);
      this.bossAnchor.rotation.set(0, 0, 0);
    } else if (this.phase === 'boss_ejection') {
      const liftPosition = new THREE.Vector3(-0.75, 1.2, -1.1);
      const breachPosition = new THREE.Vector3(2.35, 1.55, -0.55);
      const outsidePosition = new THREE.Vector3(9.4, 3.1, -0.9);
      if (p < 0.2) {
        this.bossAnchor.position.copy(lerpVector(
          BOSS_SEAT_POSITION,
          liftPosition,
          THREE.MathUtils.smoothstep(p / 0.2, 0, 1),
        ));
      } else if (p < 0.62) {
        this.bossAnchor.position.copy(lerpVector(
          liftPosition,
          breachPosition,
          THREE.MathUtils.smoothstep((p - 0.2) / 0.42, 0, 1),
        ));
      } else {
        this.bossAnchor.position.copy(lerpVector(
          breachPosition,
          outsidePosition,
          THREE.MathUtils.smoothstep((p - 0.62) / 0.38, 0, 1),
        ));
      }
      this.bossAnchor.rotation.set(p * 0.8, p * 1.2, -p * 2.4);
    }

    let debrisDistance = 0;
    if (this.phase === 'boss_ejection') {
      debrisDistance = THREE.MathUtils.smoothstep(p, 0, 1) * 2.8;
    } else if ([
      'angel_arrival',
      'wish',
      'ack',
      'generating',
    ].includes(this.phase)) {
      debrisDistance = 2.8;
    } else if (this.phase === 'ejection') {
      debrisDistance = 2.8 + THREE.MathUtils.smoothstep(p, 0, 1) * 4.8;
    } else if (['free_fall', 'impact'].includes(this.phase)) {
      debrisDistance = 7.6;
    }
    for (const panel of this.helicopter.userData.refs.debris.children) {
      panel.position.copy(panel.userData.basePosition)
        .addScaledVector(panel.userData.velocity, debrisDistance);
    }

    if (this.waterRipples.visible) {
      for (const ripple of this.waterRipples.children) {
        const cycle = (this.elapsed * 0.34 + ripple.userData.phaseOffset) % 1;
        const scale = 0.55 + cycle * 5.2;
        ripple.scale.setScalar(scale);
        ripple.material.opacity = Math.sin(cycle * Math.PI) * 0.52;
      }
    }

    if (this.phase === 'angel_arrival') {
      this.angelAnchor.position.copy(lerpVector(
        new THREE.Vector3(5.8, 1.2, 0.25),
        new THREE.Vector3(2.9, 0.95, 0.25),
        THREE.MathUtils.smoothstep(p, 0, 1),
      ));
    } else if (this.phase === 'wish' || this.phase === 'ack' || this.phase === 'generating') {
      this.angelAnchor.position.set(2.9, 0.95 + Math.sin(this.elapsed * 2.2) * 0.08, 0.25);
    } else if (this.phase === 'ejection') {
      this.angelAnchor.position.set(3.5 + p * 1.6, 1.05 - p * 0.2, 0.4 + p);
      const breachApproach = new THREE.Vector3(1.7, 1.15, 0.45);
      const breachExit = new THREE.Vector3(2.8, 1.65, 0.55);
      const outside = new THREE.Vector3(8.2, -3.2, 4.5);
      if (p < 0.32) {
        this.playerProxy.position.copy(lerpVector(
          PLAYER_SEAT_POSITION,
          breachApproach,
          THREE.MathUtils.smoothstep(p / 0.32, 0, 1),
        ));
      } else if (p < 0.58) {
        this.playerProxy.position.copy(lerpVector(
          breachApproach,
          breachExit,
          THREE.MathUtils.smoothstep((p - 0.32) / 0.26, 0, 1),
        ));
      } else {
        this.playerProxy.position.copy(lerpVector(
          breachExit,
          outside,
          THREE.MathUtils.smoothstep((p - 0.58) / 0.42, 0, 1),
        ));
      }
      this.playerProxy.rotation.set(p * 0.8, Math.PI + p * 0.65, -p * 1.2);
    } else if (this.phase === 'free_fall') {
      this.helicopter.position.set(-5 * p, 18 + p * 72, 8 + p * 24);
      this.helicopter.rotation.z = -0.22 - p * 0.55;
      this.helicopter.scale.setScalar(1 - p * 0.45);
      const settle = THREE.MathUtils.smoothstep(p, 0, 0.28);
      const playerTarget = new THREE.Vector3(
        0,
        0.4 + Math.sin(this.elapsed * 2.7) * 0.25 * (1 - p),
        0,
      );
      const angelTarget = playerTarget.clone().add(new THREE.Vector3(
        3.2 + Math.sin(this.elapsed * 2.4) * 0.3,
        0.9,
        1.4,
      ));
      this.playerProxy.position.copy(lerpVector(
        this.fallStartPlayerPosition,
        playerTarget,
        settle,
      ));
      this.angelAnchor.position.copy(lerpVector(
        this.fallStartAngelPosition,
        angelTarget,
        settle,
      ));
      this.playerProxy.lookAt(this.angelAnchor.position);
      this.playerProxy.rotation.x += -0.2 + Math.sin(this.elapsed * 1.7) * 0.12;
      this.playerProxy.rotation.z += Math.sin(this.elapsed * 2.1) * 0.18;
      this.ocean.position.y = THREE.MathUtils.lerp(-100, -0.5, p * p);
    } else if (this.phase === 'impact') {
      this.helicopter.visible = false;
      this.angelAnchor.visible = p < 0.25;
      this.ocean.position.y = -0.5;
      this.playerProxy.position.y = THREE.MathUtils.lerp(0.4, -2.5, p);
      const splashScale = 0.4 + p * 4.5;
      this.splash.scale.setScalar(splashScale);
      this.splash.userData.material.opacity = Math.max(0, 0.9 - p * 0.8);
      this.splash.children.slice(1).forEach(drop => {
        drop.position.y = Math.sin(p * Math.PI) * (2.2 + p * 2);
        drop.position.x = Math.cos(drop.userData.angle) * (0.8 + p * 2.5);
        drop.position.z = Math.sin(drop.userData.angle) * (0.8 + p * 2.5);
      });
    } else if (this.phase === 'iris_focus' || this.phase === 'final_black') {
      this.playerProxy.visible = false;
      this.angelAnchor.visible = false;
      this.ocean.position.y = -0.5;
    } else {
      this.ocean.position.y = -100;
    }

    if (this.angelAnchor.visible) {
      faceTowardOnY(this.angelAnchor, this.playerProxy.position);
    }
  }

  getCameraPose() {
    const p = this.progress;
    const cabinPoint = (x, y, z) => this.helicopter.localToWorld(new THREE.Vector3(x, y, z));
    let position = cabinPoint(4.2, 2.8, 3.7);
    let lookAt = cabinPoint(-1.2, 1.55, 0.1);
    let fov = 58;
    let shotId = CINEMATIC_SHOT_IDS.HANDHELD_THIRD_PERSON;
    let shakeId = CINEMATIC_SHAKE_IDS.ROTOR_CABIN;
    let shakeIntensity = 1;
    const playerPosition = this.playerProxy.getWorldPosition(new THREE.Vector3());
    const playerFocus = playerPosition.clone().add(new THREE.Vector3(0, 1.25, 0));
    const bossFocus = this.bossAnchor.getWorldPosition(new THREE.Vector3())
      .add(new THREE.Vector3(0, 1.35, 0));
    const angelPosition = this.angelAnchor.getWorldPosition(new THREE.Vector3());
    const angelFocus = angelPosition.clone().add(new THREE.Vector3(0, 1.35, 0));

    if (this.phase === 'prelude') {
      position.copy(cabinPoint(-1.2, 1.63, 1.42));
      lookAt.copy(bossFocus);
      fov = 64;
      shotId = CINEMATIC_SHOT_IDS.POV_WAKE;
      shakeId = CINEMATIC_SHAKE_IDS.BREATHING;
      shakeIntensity = 0.5;
    } else if (this.phase === 'boss_reveal') {
      position.copy(lerpVector(
        cabinPoint(-1.2, 1.63, 1.42),
        cabinPoint(-1.2, 1.68, 1.32),
        THREE.MathUtils.smoothstep(p, 0, 1),
      ));
      lookAt.copy(bossFocus);
      fov = THREE.MathUtils.lerp(64, 58, p);
      shotId = CINEMATIC_SHOT_IDS.POV_WAKE;
      shakeIntensity = 0.62;
    } else if (this.phase === 'head_shake') {
      position.copy(cabinPoint(-1.2, 1.66, 1.38));
      const decay = 1 - THREE.MathUtils.smoothstep(p, 0, 1);
      const lateral = Math.sin(p * Math.PI * 4.5) * decay * 0.72;
      const vertical = Math.sin(p * Math.PI * 3) * decay * 0.16;
      lookAt.copy(bossFocus).add(new THREE.Vector3(lateral, vertical, 0));
      fov = 60;
      shotId = CINEMATIC_SHOT_IDS.POV_WAKE;
      shakeIntensity = 0.7;
    } else if (this.phase === 'cabin_two_shot') {
      position.copy(lerpVector(
        cabinPoint(4.9, 2.82, 0.25),
        cabinPoint(4.25, 2.58, 0.2),
        THREE.MathUtils.smoothstep(p, 0, 1),
      ));
      lookAt.copy(playerFocus.clone().lerp(bossFocus, 0.5));
      fov = 56;
      shotId = CINEMATIC_SHOT_IDS.DIALOGUE_TWO_SHOT;
      shakeIntensity = 0.82;
    } else if (this.phase === 'boss_warning') {
      position.copy(cabinPoint(0.28, 2.2, 2.35));
      lookAt.copy(bossFocus);
      fov = 50;
      shotId = CINEMATIC_SHOT_IDS.DIALOGUE_OVER_SHOULDER;
      shakeIntensity = 0.9;
    } else if (this.phase === 'player_silence') {
      position.copy(cabinPoint(0.2, 2.2, -2.25));
      lookAt.copy(playerFocus);
      fov = 44;
      shotId = CINEMATIC_SHOT_IDS.REACTION_CLOSE_UP;
      shakeIntensity = 0.84;
    } else if (this.phase === 'boss_ejection') {
      position.copy(lerpVector(
        cabinPoint(0.7, 2.55, 0.55),
        new THREE.Vector3(4.3, 4.1, 3.2),
        THREE.MathUtils.smoothstep(p, 0.22, 1),
      ));
      lookAt.copy(bossFocus);
      fov = THREE.MathUtils.lerp(60, 68, p);
      shotId = CINEMATIC_SHOT_IDS.ACTION_TRACKING;
      shakeId = CINEMATIC_SHAKE_IDS.CRISIS;
      shakeIntensity = THREE.MathUtils.lerp(0.72, 1, p);
    } else if (this.phase === 'angel_arrival') {
      position.copy(lerpVector(
        cabinPoint(0.25, 2.58, 1.95),
        cabinPoint(1.45, 2.38, 1.65),
        THREE.MathUtils.smoothstep(p, 0, 1),
      ));
      lookAt.copy(angelFocus);
      fov = 58;
      shotId = CINEMATIC_SHOT_IDS.ENTRANCE_REVEAL;
    } else if (this.phase === 'wish') {
      const angelFaceFocus = angelPosition.clone().add(new THREE.Vector3(0, 1.95, 0));
      const viewerDirection = playerFocus.clone().sub(angelFaceFocus).normalize();
      position.copy(angelFaceFocus)
        .addScaledVector(viewerDirection, 2.8)
        .add(new THREE.Vector3(0, 0.08, 0));
      lookAt.copy(angelFaceFocus);
      fov = 38;
      shotId = CINEMATIC_SHOT_IDS.FACE_CLOSE_UP;
      shakeId = CINEMATIC_SHAKE_IDS.BREATHING;
      shakeIntensity = 0.42;
    } else if (this.phase === 'ack' || this.phase === 'generating') {
      position.copy(cabinPoint(-1, 4, -4.5));
      lookAt.copy(playerFocus.clone().lerp(angelFocus, 0.5));
      fov = 56;
      shotId = CINEMATIC_SHOT_IDS.DIALOGUE_TWO_SHOT;
      shakeIntensity = this.phase === 'ack' ? 0.7 : 0.86;
    } else if (this.phase === 'ejection') {
      const trackingPosition = playerPosition.clone().add(FALL_CAMERA_EJECTION_OFFSET);
      position.copy(lerpVector(
        cabinPoint(-1, 4, -4.5),
        trackingPosition,
        THREE.MathUtils.smoothstep(p, 0.08, 1),
      ));
      lookAt.copy(playerFocus.clone().lerp(
        angelFocus,
        THREE.MathUtils.lerp(0.5, 0.35, p),
      ));
      fov = THREE.MathUtils.lerp(56, 64, p);
      shotId = CINEMATIC_SHOT_IDS.ACTION_TRACKING;
      shakeId = CINEMATIC_SHAKE_IDS.FREE_FALL;
      shakeIntensity = THREE.MathUtils.lerp(0.55, 0.8, p);
    } else if (this.phase === 'free_fall') {
      const cameraOffset = lerpVector(
        FALL_CAMERA_EJECTION_OFFSET,
        FALL_CAMERA_TRACK_OFFSET,
        THREE.MathUtils.smoothstep(p, 0, 1),
      );
      position.copy(playerPosition).add(cameraOffset);
      lookAt.copy(playerFocus.clone().lerp(angelFocus, 0.35));
      fov = THREE.MathUtils.lerp(64, 60, p);
      shotId = CINEMATIC_SHOT_IDS.ACTION_TRACKING;
      shakeId = CINEMATIC_SHAKE_IDS.FREE_FALL;
      shakeIntensity = 0.8;
    } else if (this.phase === 'impact') {
      const cameraOffset = lerpVector(
        FALL_CAMERA_TRACK_OFFSET,
        FALL_CAMERA_IMPACT_OFFSET,
        THREE.MathUtils.smoothstep(p, 0, 1),
      );
      position.copy(playerPosition).add(cameraOffset);
      lookAt.copy(playerFocus.clone().lerp(angelFocus, 0.35).lerp(
        new THREE.Vector3(0, -0.2, 0),
        THREE.MathUtils.smoothstep(p, 0.08, 1),
      ));
      fov = THREE.MathUtils.lerp(60, 68, p);
      shotId = CINEMATIC_SHOT_IDS.ACTION_TRACKING;
      shakeId = CINEMATIC_SHAKE_IDS.FREE_FALL;
      shakeIntensity = THREE.MathUtils.lerp(0.8, 0.15, p);
    } else if (this.phase === 'iris_focus' || this.phase === 'final_black') {
      position.set(0, 8.5, 5.4);
      lookAt.set(0, -0.46, 0);
      fov = 46;
      shotId = CINEMATIC_SHOT_IDS.FOCUS_INSERT;
      shakeId = CINEMATIC_SHAKE_IDS.NONE;
    }
    return applyCinematicCameraShake(
      createCinematicCameraPose({ position, lookAt, fov, shotId }),
      { shakeId, elapsed: this.elapsed, intensity: shakeIntensity },
    );
  }

  dispose() {
    const sharedPlayerObjects = new Set();
    this.playerProxy.traverse(object => sharedPlayerObjects.add(object));
    this.root.traverse(object => {
      if (sharedPlayerObjects.has(object)) return;
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) {
        for (const material of object.material) material?.dispose?.();
      } else {
        object.material?.dispose?.();
      }
    });
    this.root.removeFromParent();
  }
}
