import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  applyCinematicCameraShake,
  CINEMATIC_SHAKE_IDS,
  CINEMATIC_SHOT_IDS,
  CINEMATIC_SHOT_TEMPLATES,
  CINEMATIC_TRANSITION_IDS,
  CINEMATIC_TRANSITION_TEMPLATES,
  createCinematicCameraPose,
  sampleCinematicTransition,
} from '../src/demos/chii-island/presentation/cinematic/CinematicTemplateLibrary.js';

test('cinematic catalog covers common dialogue, reveal, close-up, action, and focus shots', () => {
  for (const id of [
    CINEMATIC_SHOT_IDS.POV_WAKE,
    CINEMATIC_SHOT_IDS.HANDHELD_THIRD_PERSON,
    CINEMATIC_SHOT_IDS.DIALOGUE_TWO_SHOT,
    CINEMATIC_SHOT_IDS.DIALOGUE_OVER_SHOULDER,
    CINEMATIC_SHOT_IDS.ENTRANCE_REVEAL,
    CINEMATIC_SHOT_IDS.FACE_CLOSE_UP,
    CINEMATIC_SHOT_IDS.ACTION_TRACKING,
    CINEMATIC_SHOT_IDS.FOCUS_INSERT,
  ]) {
    assert.equal(CINEMATIC_SHOT_TEMPLATES[id].id, id);
  }
});

test('cinematic catalog distinguishes ready screen effects from two-surface edits', () => {
  assert.equal(CINEMATIC_TRANSITION_TEMPLATES[CINEMATIC_TRANSITION_IDS.IRIS_FOCUS].runtimeSupport, 'ready');
  assert.equal(
    CINEMATIC_TRANSITION_TEMPLATES[CINEMATIC_TRANSITION_IDS.DISSOLVE].runtimeSupport,
    'requires_two_surfaces',
  );
});

test('wake transition fades from black and produces several eyelid closures', () => {
  const start = sampleCinematicTransition(CINEMATIC_TRANSITION_IDS.POV_WAKE_BLINK, 0);
  const firstBlink = sampleCinematicTransition(CINEMATIC_TRANSITION_IDS.POV_WAKE_BLINK, 0.42);
  const secondBlink = sampleCinematicTransition(CINEMATIC_TRANSITION_IDS.POV_WAKE_BLINK, 0.62);
  const end = sampleCinematicTransition(CINEMATIC_TRANSITION_IDS.POV_WAKE_BLINK, 1);

  assert.equal(start.solidBlackOpacity, 1);
  assert.ok(firstBlink.eyelidClosure > 0.95);
  assert.ok(secondBlink.eyelidClosure > 0.95);
  assert.equal(end.solidBlackOpacity, 0);
  assert.equal(end.eyelidClosure, 0);
});

test('iris transition preserves a circular view before closing fully to black', () => {
  const focusStart = sampleCinematicTransition(CINEMATIC_TRANSITION_IDS.IRIS_FOCUS, 0, {
    endRadiusVmax: 24,
  });
  const focusEnd = sampleCinematicTransition(CINEMATIC_TRANSITION_IDS.IRIS_FOCUS, 1, {
    endRadiusVmax: 24,
  });
  const closeEnd = sampleCinematicTransition(CINEMATIC_TRANSITION_IDS.IRIS_TO_BLACK, 1, {
    startRadiusVmax: 24,
  });

  assert.ok(focusStart.irisRadiusVmax > focusEnd.irisRadiusVmax);
  assert.equal(focusEnd.irisRadiusVmax, 24);
  assert.equal(focusEnd.irisOpacity, 1);
  assert.equal(closeEnd.irisRadiusVmax, 0);
  assert.equal(closeEnd.irisOpacity, 1);
});

test('camera shake is deterministic and does not mutate the authored camera pose', () => {
  const pose = createCinematicCameraPose({
    position: new THREE.Vector3(1, 2, 3),
    lookAt: new THREE.Vector3(4, 5, 6),
    shotId: CINEMATIC_SHOT_IDS.HANDHELD_THIRD_PERSON,
  });
  const originalPosition = pose.position.clone();
  const first = applyCinematicCameraShake(pose, {
    shakeId: CINEMATIC_SHAKE_IDS.ROTOR_CABIN,
    elapsed: 1.25,
  });
  const second = applyCinematicCameraShake(pose, {
    shakeId: CINEMATIC_SHAKE_IDS.ROTOR_CABIN,
    elapsed: 1.25,
  });

  assert.deepEqual(first.position.toArray(), second.position.toArray());
  assert.deepEqual(pose.position.toArray(), originalPosition.toArray());
  assert.notDeepEqual(first.position.toArray(), pose.position.toArray());
});
