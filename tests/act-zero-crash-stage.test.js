import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  ActZeroCrashStage,
  createDamagedHelicopter,
} from '../src/demos/chii-island/presentation/ActZeroCrashStage.js';
import { CINEMATIC_SHOT_IDS } from '../src/demos/chii-island/presentation/cinematic/CinematicTemplateLibrary.js';

test('code-built helicopter has a real breach and visible cabin seats', () => {
  const helicopter = createDamagedHelicopter();
  const opening = helicopter.userData.damageOpening;
  const seats = helicopter.getObjectByName('helicopter_seats');

  assert.equal(opening.side, 'starboard');
  assert.ok(opening.max.y - opening.min.y >= 3.5);
  assert.ok(opening.max.z - opening.min.z >= 3.5);
  assert.equal(helicopter.getObjectByName('starboard_wall_center'), undefined);
  assert.equal(seats.children.filter(child => child.name.startsWith('cabin_seat_')).length, 6);
  assert.ok(Math.abs(helicopter.getObjectByName('cabin_seat_1').rotation.y - Math.PI) < 0.001);
  assert.ok(helicopter.getObjectByName('seat_1_headrest'));
  assert.ok(helicopter.getObjectByName('seat_1_lap_belt'));
  assert.ok(helicopter.getObjectByName('port_window_1'));
  assert.ok(helicopter.getObjectByName('rear_control_panel'));
  assert.ok(helicopter.getObjectByName('breach_damage'));
  assert.ok(helicopter.getObjectByName('main_rotor'));
  assert.ok(helicopter.getObjectByName('tail_rotor'));
});

test('ActZeroCrashStage frames wish input as angel POV and confirmation as a two-shot', () => {
  const player = new THREE.Group();
  player.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial()));
  const stage = new ActZeroCrashStage({ playerMesh: player });
  stage.attachAngel(new THREE.Group());

  stage.setPhase('wish', 0.5);
  stage.update(0.016);
  const interior = stage.getCameraPose();
  const angelFace = stage.angelAnchor.getWorldPosition(new THREE.Vector3())
    .add(new THREE.Vector3(0, 1.95, 0));
  assert.ok(interior.position.distanceTo(angelFace) > 2.6);
  assert.ok(interior.position.distanceTo(angelFace) < 3.1);
  assert.equal(interior.shotId, CINEMATIC_SHOT_IDS.FACE_CLOSE_UP);

  stage.setPhase('ack', 0.5);
  stage.update(0.016);
  assert.equal(stage.getCameraPose().shotId, CINEMATIC_SHOT_IDS.DIALOGUE_TWO_SHOT);
});

test('ActZeroCrashStage exposes readable fall and water-focus camera shots', () => {
  const stage = new ActZeroCrashStage();
  stage.attachAngel(new THREE.Group());
  stage.attachPlayer(new THREE.Group());

  stage.setPhase('free_fall', 0.8);
  stage.update(0.016);
  const fall = stage.getCameraPose();
  assert.equal(stage.windLines.visible, true);
  assert.ok(fall.fov >= 58 && fall.fov <= 64);
  assert.ok(stage.ocean.position.y > -100);

  stage.setPhase('iris_focus', 0.5);
  stage.update(0.016);
  const waterFocus = stage.getCameraPose();
  assert.equal(stage.waterRipples.visible, true);
  assert.ok(stage.waterRipples.children.length >= 3);
  assert.ok(stage.waterRipples.children.some(ripple => ripple.material.opacity > 0));
  assert.equal(stage.finalRing, undefined);
  assert.equal(stage.playerProxy.visible, false);
  assert.equal(waterFocus.shotId, CINEMATIC_SHOT_IDS.FOCUS_INSERT);
  assert.ok(waterFocus.position.y > 6);
});

test('ActZeroCrashStage follows the boss dialogue axis and ejects him through the breach', () => {
  const player = new THREE.Group();
  player.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial()));
  const stage = new ActZeroCrashStage({ playerMesh: player });
  stage.attachBoss(new THREE.Group());
  stage.attachAngel(new THREE.Group());

  stage.setPhase('prelude', 0.5);
  stage.update(0.016);
  assert.equal(stage.playerProxy.visible, false);
  assert.equal(stage.bossAnchor.visible, true);
  assert.equal(stage.angelAnchor.visible, false);
  assert.equal(stage.getCameraPose().shotId, CINEMATIC_SHOT_IDS.POV_WAKE);

  stage.setPhase('head_shake', 0.12);
  stage.update(0.016);
  const headShake = stage.getCameraPose();
  const bossPosition = stage.bossAnchor.getWorldPosition(new THREE.Vector3());
  assert.equal(headShake.shotId, CINEMATIC_SHOT_IDS.POV_WAKE);
  assert.ok(Math.abs(headShake.lookAt.x - bossPosition.x) > 0.3);

  stage.setPhase('cabin_two_shot', 0.6);
  stage.update(0.016);
  assert.equal(stage.playerProxy.visible, true);
  assert.equal(stage.bossAnchor.visible, true);
  assert.equal(stage.getCameraPose().shotId, CINEMATIC_SHOT_IDS.DIALOGUE_TWO_SHOT);

  stage.setPhase('boss_warning', 0.5);
  stage.update(0.016);
  assert.equal(stage.getCameraPose().shotId, CINEMATIC_SHOT_IDS.DIALOGUE_OVER_SHOULDER);

  stage.setPhase('player_silence', 0.5);
  stage.update(0.016);
  assert.equal(stage.getCameraPose().shotId, CINEMATIC_SHOT_IDS.REACTION_CLOSE_UP);

  stage.setPhase('boss_ejection', 0.75);
  stage.update(0.016);
  assert.ok(stage.bossAnchor.position.x > 2.35);
  assert.equal(stage.cabinSuctionLines.visible, true);
  assert.equal(stage.windLines.visible, true);
  assert.equal(stage.getCameraPose().shotId, CINEMATIC_SHOT_IDS.ACTION_TRACKING);

  stage.setPhase('angel_arrival', 0.4);
  stage.update(0.016);
  assert.equal(stage.bossAnchor.visible, false);
  assert.equal(stage.angelAnchor.visible, true);
  assert.equal(stage.getCameraPose().shotId, CINEMATIC_SHOT_IDS.ENTRANCE_REVEAL);
  const angelForward = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(stage.angelAnchor.quaternion);
  const towardPlayer = stage.playerProxy.position.clone()
    .sub(stage.angelAnchor.position)
    .setY(0)
    .normalize();
  assert.ok(angelForward.dot(towardPlayer) > 0.99);
});

test('ejection, free fall, and water impact use one continuous tracking shot', () => {
  const stage = new ActZeroCrashStage();
  stage.attachAngel(new THREE.Group());
  stage.attachPlayer(new THREE.Group());

  stage.setPhase('ejection', 1);
  stage.update(0);
  const ejectionEnd = stage.getCameraPose();

  stage.setPhase('free_fall', 0);
  stage.update(0);
  const fallStart = stage.getCameraPose();
  assert.equal(ejectionEnd.shotId, CINEMATIC_SHOT_IDS.ACTION_TRACKING);
  assert.equal(fallStart.shotId, CINEMATIC_SHOT_IDS.ACTION_TRACKING);
  assert.ok(ejectionEnd.position.distanceTo(fallStart.position) < 0.001);
  assert.ok(ejectionEnd.lookAt.distanceTo(fallStart.lookAt) < 0.001);
  assert.ok(Math.abs(ejectionEnd.fov - fallStart.fov) < 0.001);

  stage.setPhase('free_fall', 1);
  stage.update(0);
  const fallEnd = stage.getCameraPose();

  stage.setPhase('impact', 0);
  stage.update(0);
  const impactStart = stage.getCameraPose();
  assert.equal(impactStart.shotId, CINEMATIC_SHOT_IDS.ACTION_TRACKING);
  assert.ok(fallEnd.position.distanceTo(impactStart.position) < 0.001);
  assert.ok(fallEnd.lookAt.distanceTo(impactStart.lookAt) < 0.001);
  assert.ok(Math.abs(fallEnd.fov - impactStart.fov) < 0.001);
});
