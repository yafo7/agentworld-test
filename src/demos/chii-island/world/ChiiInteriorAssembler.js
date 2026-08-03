import * as THREE from 'three';
import { StaticEntity } from '../../../engine/entity/StaticEntity.js';
import { mergeMeshGroup } from '../../../engine/model/builder.js';
import {
  CHURCH_INTERIOR_ASSET_SPECS,
  CHURCH_INTERIOR_PLAN,
  EMPTY_INTERIOR_PLAN,
  interiorWorldPoint,
} from '../data/interiorPlans.js';

const DOOR_WIDTH = 3.4;
const DOOR_HEIGHT = 4.6;

function addBox(parent, name, size, position, material, rotation = null) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    material,
  );
  mesh.name = name;
  mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addColumn(parent, name, x, z, material) {
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.52, 0.66, 8.2, 8),
    material,
  );
  shaft.name = name;
  shaft.position.set(x, 4.1, z);
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  parent.add(shaft);

  addBox(parent, `${name}_base`, [1.45, 0.55, 1.45], [x, 0.275, z], material);
  addBox(parent, `${name}_capital`, [1.2, 0.55, 1.2], [x, 8.05, z], material);
}

function addRib(parent, name, curve, material, radius = 0.13) {
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 16, radius, 6, false),
    material,
  );
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
}

function addPointedWindow(parent, {
  name,
  width = 2.4,
  height = 5.2,
  color,
  position,
  rotationY = 0,
}) {
  const shape = new THREE.Shape();
  const shoulderY = height * 0.24;
  shape.moveTo(-width / 2, -height / 2);
  shape.lineTo(width / 2, -height / 2);
  shape.lineTo(width / 2, shoulderY);
  shape.lineTo(0, height / 2);
  shape.lineTo(-width / 2, shoulderY);
  shape.closePath();

  const glass = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.38,
      transparent: true,
      opacity: 0.82,
      roughness: 0.38,
      metalness: 0.04,
      side: THREE.DoubleSide,
    }),
  );
  glass.name = name;
  glass.position.set(position[0], position[1], position[2]);
  glass.rotation.y = rotationY;
  parent.add(glass);

  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(glass.geometry),
    new THREE.LineBasicMaterial({ color: 0x2f2928 }),
  );
  frame.position.copy(glass.position);
  frame.rotation.copy(glass.rotation);
  frame.name = `${name}_frame`;
  parent.add(frame);
}

function addGable(parent, name, {
  width,
  baseY,
  peakY,
  z,
  rotationY = 0,
  material,
}) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, baseY);
  shape.lineTo(width / 2, baseY);
  shape.lineTo(0, peakY);
  shape.closePath();

  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
  mesh.name = name;
  mesh.position.z = z;
  mesh.rotation.y = rotationY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
}

function createRoomMaterials() {
  return {
    stone: new THREE.MeshStandardMaterial({ color: 0x8b8881, roughness: 0.93 }),
    darkStone: new THREE.MeshStandardMaterial({ color: 0x4f5056, roughness: 0.96 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x67686b, roughness: 0.9 }),
    aisle: new THREE.MeshStandardMaterial({ color: 0x7b5e56, roughness: 0.88 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x4c2e20, roughness: 0.86 }),
    gold: new THREE.MeshStandardMaterial({
      color: 0xc7a34d,
      emissive: 0x5f4312,
      emissiveIntensity: 0.2,
      roughness: 0.48,
      metalness: 0.38,
    }),
    plaster: new THREE.MeshStandardMaterial({ color: 0xd6d4ca, roughness: 0.9 }),
    emptyFloor: new THREE.MeshStandardMaterial({ color: 0x8b6546, roughness: 0.88 }),
  };
}

function addRoomBoundaryColliders(physics, plan, {
  columnXs = [],
  columnZs = [],
} = {}) {
  const body = physics.createStaticBody();
  const { width, depth, height } = plan.size;
  const { x: ox, y: oy, z: oz } = plan.origin;
  const wallThickness = 0.55;
  const sideWidth = (width - DOOR_WIDTH) / 2;

  physics.addStaticBoxToBody(
    body,
    wallThickness / 2,
    height / 2,
    depth / 2,
    ox - width / 2,
    oy + height / 2,
    oz,
  );
  physics.addStaticBoxToBody(
    body,
    wallThickness / 2,
    height / 2,
    depth / 2,
    ox + width / 2,
    oy + height / 2,
    oz,
  );
  physics.addStaticBoxToBody(
    body,
    width / 2,
    height / 2,
    wallThickness / 2,
    ox,
    oy + height / 2,
    oz - depth / 2,
  );
  for (const sign of [-1, 1]) {
    physics.addStaticBoxToBody(
      body,
      sideWidth / 2,
      height / 2,
      wallThickness / 2,
      ox + sign * (DOOR_WIDTH / 2 + sideWidth / 2),
      oy + height / 2,
      oz + depth / 2,
    );
  }
  physics.addStaticBoxToBody(
    body,
    DOOR_WIDTH / 2,
    (height - DOOR_HEIGHT) / 2,
    wallThickness / 2,
    ox,
    oy + DOOR_HEIGHT + (height - DOOR_HEIGHT) / 2,
    oz + depth / 2,
  );
  physics.addStaticBoxToBody(
    body,
    DOOR_WIDTH / 2,
    DOOR_HEIGHT / 2,
    0.16,
    ox,
    oy + DOOR_HEIGHT / 2,
    oz + depth / 2 - 0.2,
  );

  for (const x of columnXs) {
    for (const z of columnZs) {
      physics.addStaticCylinderToBody(body, 4.1, 0.66, ox + x, oy + 4.1, oz + z);
    }
  }
  return body;
}

function buildChurchArchitecture(root, physics, plan, materials) {
  const { width, depth, height } = plan.size;
  const halfW = width / 2;
  const halfD = depth / 2;

  addBox(root, 'church_floor', [width, 0.18, depth], [0, 0.09, 0], materials.floor);
  addBox(root, 'church_central_aisle', [3.4, 0.08, depth - 2], [0, 0.22, 0], materials.aisle);
  addBox(root, 'church_sanctuary_step', [12, 0.62, 6.2], [0, 0.31, -14.6], materials.darkStone);

  addBox(root, 'church_left_wall', [0.55, 9.2, depth], [-halfW, 4.6, 0], materials.stone);
  addBox(root, 'church_right_wall', [0.55, 9.2, depth], [halfW, 4.6, 0], materials.stone);
  addBox(root, 'church_apse_wall', [width, 9.2, 0.55], [0, 4.6, -halfD], materials.stone);
  addGable(root, 'church_apse_gable', {
    width,
    baseY: 9.2,
    peakY: height,
    z: -halfD + 0.29,
    material: materials.stone,
  });

  const frontSideWidth = (width - DOOR_WIDTH) / 2;
  addBox(
    root,
    'church_front_left',
    [frontSideWidth, 9.2, 0.55],
    [-(DOOR_WIDTH / 2 + frontSideWidth / 2), 4.6, halfD],
    materials.stone,
  );
  addBox(
    root,
    'church_front_right',
    [frontSideWidth, 9.2, 0.55],
    [DOOR_WIDTH / 2 + frontSideWidth / 2, 4.6, halfD],
    materials.stone,
  );
  addBox(
    root,
    'church_front_arch_header',
    [DOOR_WIDTH, height - DOOR_HEIGHT, 0.55],
    [0, DOOR_HEIGHT + (height - DOOR_HEIGHT) / 2, halfD],
    materials.stone,
  );
  addGable(root, 'church_front_gable', {
    width,
    baseY: 9.2,
    peakY: height,
    z: halfD - 0.29,
    rotationY: Math.PI,
    material: materials.stone,
  });
  addBox(root, 'church_exit_door', [DOOR_WIDTH - 0.2, DOOR_HEIGHT, 0.28], [0, DOOR_HEIGHT / 2, halfD - 0.2], materials.wood);

  const roofSlope = Math.hypot(halfW, height - 9);
  const roofAngle = Math.atan2(height - 9, halfW);
  addBox(root, 'church_roof_left', [roofSlope, 0.38, depth], [-halfW / 2, 11.5, 0], materials.darkStone, [0, 0, roofAngle]);
  addBox(root, 'church_roof_right', [roofSlope, 0.38, depth], [halfW / 2, 11.5, 0], materials.darkStone, [0, 0, -roofAngle]);

  const columnXs = [-7.5, 7.5];
  const columnZs = [-14.5, -8.5, -2.5, 3.5, 9.5, 15.5];
  for (const x of columnXs) {
    for (const z of columnZs) addColumn(root, `church_column_${x}_${z}`, x, z, materials.stone);
  }

  for (const z of columnZs) {
    addRib(
      root,
      `church_rib_left_${z}`,
      new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-7.5, 8.2, z),
        new THREE.Vector3(-3.6, 13.3, z),
        new THREE.Vector3(0, 13.75, z),
      ),
      materials.stone,
    );
    addRib(
      root,
      `church_rib_right_${z}`,
      new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, 13.75, z),
        new THREE.Vector3(3.6, 13.3, z),
        new THREE.Vector3(7.5, 8.2, z),
      ),
      materials.stone,
    );
  }

  const windowColors = [0x2f85c7, 0xc84a55, 0xd5a947, 0x4b9f77, 0x775fc7];
  const windowZs = [-11.5, -5.5, 0.5, 6.5, 12.5];
  windowZs.forEach((z, index) => {
    addPointedWindow(root, {
      name: `church_window_left_${index}`,
      color: windowColors[index % windowColors.length],
      position: [-halfW + 0.29, 6.4, z],
      rotationY: Math.PI / 2,
    });
    addPointedWindow(root, {
      name: `church_window_right_${index}`,
      color: windowColors[(index + 2) % windowColors.length],
      position: [halfW - 0.29, 6.4, z],
      rotationY: -Math.PI / 2,
    });
  });

  const roseGlass = new THREE.Mesh(
    new THREE.CircleGeometry(2.55, 24),
    new THREE.MeshStandardMaterial({
      color: 0x355fb2,
      emissive: 0x263c8b,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 0.86,
      side: THREE.DoubleSide,
    }),
  );
  roseGlass.name = 'church_rose_window_glass';
  roseGlass.position.set(0, 8.7, -halfD + 0.29);
  root.add(roseGlass);
  const roseFrame = new THREE.Mesh(
    new THREE.TorusGeometry(2.58, 0.18, 8, 28),
    materials.gold,
  );
  roseFrame.name = 'church_rose_window_frame';
  roseFrame.position.copy(roseGlass.position);
  roseFrame.position.z += 0.03;
  root.add(roseFrame);

  for (const z of [9, -2.5, -13]) {
    const light = new THREE.PointLight(0xffc982, 4.2, 18, 1.8);
    light.name = `church_warm_light_${z}`;
    light.position.set(0, 8.2, z);
    root.add(light);
    addBox(root, `church_lamp_${z}`, [0.5, 0.18, 0.5], [0, 8.2, z], materials.gold);
  }

  addRoomBoundaryColliders(physics, plan, { columnXs, columnZs });
}

function buildEmptyArchitecture(root, physics, plan, materials) {
  const { width, depth, height } = plan.size;
  const halfW = width / 2;
  const halfD = depth / 2;
  const sideWidth = (width - DOOR_WIDTH) / 2;

  addBox(root, 'empty_room_floor', [width, 0.18, depth], [0, 0.09, 0], materials.emptyFloor);
  addBox(root, 'empty_room_ceiling', [width, 0.3, depth], [0, height, 0], materials.plaster);
  addBox(root, 'empty_room_left_wall', [0.5, height, depth], [-halfW, height / 2, 0], materials.plaster);
  addBox(root, 'empty_room_right_wall', [0.5, height, depth], [halfW, height / 2, 0], materials.plaster);
  addBox(root, 'empty_room_back_wall', [width, height, 0.5], [0, height / 2, -halfD], materials.plaster);
  addBox(root, 'empty_room_front_left', [sideWidth, height, 0.5], [-(DOOR_WIDTH / 2 + sideWidth / 2), height / 2, halfD], materials.plaster);
  addBox(root, 'empty_room_front_right', [sideWidth, height, 0.5], [DOOR_WIDTH / 2 + sideWidth / 2, height / 2, halfD], materials.plaster);
  addBox(root, 'empty_room_front_header', [DOOR_WIDTH, height - DOOR_HEIGHT, 0.5], [0, DOOR_HEIGHT + (height - DOOR_HEIGHT) / 2, halfD], materials.plaster);
  addBox(root, 'empty_room_exit_door', [DOOR_WIDTH - 0.2, DOOR_HEIGHT, 0.28], [0, DOOR_HEIGHT / 2, halfD - 0.2], materials.wood);

  const light = new THREE.PointLight(0xffd9a6, 3.2, 18, 1.8);
  light.name = 'empty_room_light';
  light.position.set(0, height - 1.1, 0);
  root.add(light);

  addRoomBoundaryColliders(physics, plan);
}

function fitEntityToTarget(entity, targetSize) {
  if (!entity?._modelGroup) return null;
  let bounds = new THREE.Box3().setFromObject(entity._modelGroup);
  let size = bounds.getSize(new THREE.Vector3());

  if (targetSize.width >= targetSize.depth && size.z > size.x) {
    entity._modelGroup.rotation.y += Math.PI / 2;
    entity._modelGroup.updateWorldMatrix(true, true);
    bounds = new THREE.Box3().setFromObject(entity._modelGroup);
    size = bounds.getSize(new THREE.Vector3());
  }

  entity._content.scale.set(
    targetSize.width / Math.max(size.x, 0.001),
    targetSize.height / Math.max(size.y, 0.001),
    targetSize.depth / Math.max(size.z, 0.001),
  );
  entity.mesh.userData.interiorTargetSize = { ...targetSize };
  entity.mesh.updateWorldMatrix(true, true);
  return { ...targetSize };
}

async function createFurnitureEntity({
  root,
  registry,
  plan,
  placement,
  modelJson,
}) {
  const spec = CHURCH_INTERIOR_ASSET_SPECS[placement.assetId];
  if (!spec || !modelJson) return null;

  const entity = new StaticEntity({
    id: placement.id,
    name: spec.name,
    tags: ['interior', 'church', 'furniture', placement.assetId],
    category: 'decor',
    position: [placement.position.x, placement.position.y, placement.position.z],
    scale: 1,
    modelJson,
    mergeGeometry: placement.assetId !== 'churchPew',
  });
  entity.mesh.rotation.y = placement.rotationY || 0;
  entity.mesh.userData.placementEditable = false;
  entity.mesh.userData.interiorId = plan.id;

  if (!entity._modelGroup) await new Promise(resolve => setTimeout(resolve, 0));
  if (placement.assetId === 'churchPew' && entity._modelGroup) {
    entity._modelGroup.position.set(0, 0, 0);
    entity._modelGroup.rotation.set(0, 0, 0);
    entity._modelGroup.scale.set(1, 1, 1);
    mergeMeshGroup(entity._modelGroup);
    const mergedBounds = new THREE.Box3().setFromObject(entity._modelGroup);
    entity._modelGroup.position.y = -mergedBounds.min.y;
  }
  fitEntityToTarget(entity, spec.targetSize);
  root.add(entity.mesh);
  root.updateWorldMatrix(true, true);
  registry.add(entity, {
    modelJson,
    operation: 'original',
    assetId: placement.assetId,
    placement: {
      editable: false,
      source: 'interior',
      trackOnIsland: false,
    },
  });
  return entity;
}

export async function assembleChiiInteriors({
  scene,
  physics,
  registry,
  modelJsons,
}) {
  const materials = createRoomMaterials();
  const churchRoot = new THREE.Group();
  churchRoot.name = CHURCH_INTERIOR_PLAN.id;
  churchRoot.position.set(
    CHURCH_INTERIOR_PLAN.origin.x,
    CHURCH_INTERIOR_PLAN.origin.y,
    CHURCH_INTERIOR_PLAN.origin.z,
  );
  scene.add(churchRoot);
  buildChurchArchitecture(churchRoot, physics, CHURCH_INTERIOR_PLAN, materials);

  const emptyRoot = new THREE.Group();
  emptyRoot.name = EMPTY_INTERIOR_PLAN.id;
  emptyRoot.position.set(
    EMPTY_INTERIOR_PLAN.origin.x,
    EMPTY_INTERIOR_PLAN.origin.y,
    EMPTY_INTERIOR_PLAN.origin.z,
  );
  scene.add(emptyRoot);
  buildEmptyArchitecture(emptyRoot, physics, EMPTY_INTERIOR_PLAN, materials);

  const furniture = [];
  for (const placement of CHURCH_INTERIOR_PLAN.furniture) {
    const entity = await createFurnitureEntity({
      root: churchRoot,
      registry,
      plan: CHURCH_INTERIOR_PLAN,
      placement,
      modelJson: modelJsons[placement.assetId],
    });
    if (entity) furniture.push(entity);
  }

  churchRoot.visible = false;
  emptyRoot.visible = false;

  return {
    rooms: new Map([
      ['church', {
        ...CHURCH_INTERIOR_PLAN,
        root: churchRoot,
        spawnWorld: interiorWorldPoint(CHURCH_INTERIOR_PLAN, CHURCH_INTERIOR_PLAN.playerSpawn),
        exitWorld: interiorWorldPoint(CHURCH_INTERIOR_PLAN, CHURCH_INTERIOR_PLAN.exitTrigger),
      }],
      ['empty', {
        ...EMPTY_INTERIOR_PLAN,
        root: emptyRoot,
        spawnWorld: interiorWorldPoint(EMPTY_INTERIOR_PLAN, EMPTY_INTERIOR_PLAN.playerSpawn),
        exitWorld: interiorWorldPoint(EMPTY_INTERIOR_PLAN, EMPTY_INTERIOR_PLAN.exitTrigger),
      }],
    ]),
    furniture,
  };
}
