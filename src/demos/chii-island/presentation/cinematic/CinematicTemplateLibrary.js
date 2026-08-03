import * as THREE from 'three';

export const CINEMATIC_SHOT_IDS = Object.freeze({
  POV_WAKE: 'pov_wake',
  ESTABLISHING_WIDE: 'establishing_wide',
  HANDHELD_THIRD_PERSON: 'handheld_third_person',
  DIALOGUE_TWO_SHOT: 'dialogue_two_shot',
  DIALOGUE_OVER_SHOULDER: 'dialogue_over_shoulder',
  SHOT_REVERSE_SHOT: 'shot_reverse_shot',
  ENTRANCE_REVEAL: 'entrance_reveal',
  FACE_CLOSE_UP: 'face_close_up',
  REACTION_CLOSE_UP: 'reaction_close_up',
  ACTION_TRACKING: 'action_tracking',
  IMPACT_WIDE: 'impact_wide',
  FOCUS_INSERT: 'focus_insert',
});

export const CINEMATIC_SHAKE_IDS = Object.freeze({
  NONE: 'none',
  BREATHING: 'breathing',
  ROTOR_CABIN: 'rotor_cabin',
  CRISIS: 'crisis',
  FREE_FALL: 'free_fall',
});

export const CINEMATIC_TRANSITION_IDS = Object.freeze({
  CUT: 'cut',
  FADE_FROM_BLACK: 'fade_from_black',
  FADE_TO_BLACK: 'fade_to_black',
  DIP_TO_BLACK: 'dip_to_black',
  DISSOLVE: 'dissolve',
  POV_WAKE_BLINK: 'pov_wake_blink',
  IRIS_FOCUS: 'iris_focus',
  IRIS_TO_BLACK: 'iris_to_black',
  FLASH_CUT: 'flash_cut',
  SOFT_BLUR_LOAD: 'soft_blur_load',
  WIPE: 'wipe',
});

export const CINEMATIC_SHOT_TEMPLATES = Object.freeze({
  [CINEMATIC_SHOT_IDS.POV_WAKE]: Object.freeze({
    id: CINEMATIC_SHOT_IDS.POV_WAKE,
    framing: 'first_person',
    movement: 'slow_settle',
    purpose: 'Wake the player inside a character viewpoint before revealing spatial context.',
    defaultFov: 64,
  }),
  [CINEMATIC_SHOT_IDS.ESTABLISHING_WIDE]: Object.freeze({
    id: CINEMATIC_SHOT_IDS.ESTABLISHING_WIDE,
    framing: 'wide',
    movement: 'static_or_slow_push',
    purpose: 'Establish geography, exits, hazards, and the relationship between actors.',
    defaultFov: 54,
  }),
  [CINEMATIC_SHOT_IDS.HANDHELD_THIRD_PERSON]: Object.freeze({
    id: CINEMATIC_SHOT_IDS.HANDHELD_THIRD_PERSON,
    framing: 'medium_wide',
    movement: 'motivated_handheld',
    purpose: 'Keep the protagonist readable while environmental motion communicates instability.',
    defaultFov: 58,
  }),
  [CINEMATIC_SHOT_IDS.DIALOGUE_TWO_SHOT]: Object.freeze({
    id: CINEMATIC_SHOT_IDS.DIALOGUE_TWO_SHOT,
    framing: 'two_shot',
    movement: 'locked_axis',
    purpose: 'Keep both speakers and their relationship visible in one composition.',
    defaultFov: 56,
  }),
  [CINEMATIC_SHOT_IDS.DIALOGUE_OVER_SHOULDER]: Object.freeze({
    id: CINEMATIC_SHOT_IDS.DIALOGUE_OVER_SHOULDER,
    framing: 'over_shoulder',
    movement: 'locked_axis',
    purpose: 'Favor the active speaker while retaining the listener as foreground context.',
    defaultFov: 48,
  }),
  [CINEMATIC_SHOT_IDS.SHOT_REVERSE_SHOT]: Object.freeze({
    id: CINEMATIC_SHOT_IDS.SHOT_REVERSE_SHOT,
    framing: 'matching_singles',
    movement: 'cut_pair',
    purpose: 'Alternate speaker and reaction coverage without crossing the dialogue axis.',
    defaultFov: 46,
  }),
  [CINEMATIC_SHOT_IDS.ENTRANCE_REVEAL]: Object.freeze({
    id: CINEMATIC_SHOT_IDS.ENTRANCE_REVEAL,
    framing: 'reveal',
    movement: 'pan_or_dolly',
    purpose: 'Reserve negative space, then guide attention to an arriving character.',
    defaultFov: 58,
  }),
  [CINEMATIC_SHOT_IDS.FACE_CLOSE_UP]: Object.freeze({
    id: CINEMATIC_SHOT_IDS.FACE_CLOSE_UP,
    framing: 'close_up',
    movement: 'subtle_breathing',
    purpose: 'Show a decisive line, expression, or emotional change.',
    defaultFov: 38,
  }),
  [CINEMATIC_SHOT_IDS.REACTION_CLOSE_UP]: Object.freeze({
    id: CINEMATIC_SHOT_IDS.REACTION_CLOSE_UP,
    framing: 'close_up',
    movement: 'hold',
    purpose: 'Let the listener response carry the beat before the next action.',
    defaultFov: 40,
  }),
  [CINEMATIC_SHOT_IDS.ACTION_TRACKING]: Object.freeze({
    id: CINEMATIC_SHOT_IDS.ACTION_TRACKING,
    framing: 'medium_wide',
    movement: 'track_subject',
    purpose: 'Keep a moving subject legible while preserving direction and speed.',
    defaultFov: 62,
  }),
  [CINEMATIC_SHOT_IDS.IMPACT_WIDE]: Object.freeze({
    id: CINEMATIC_SHOT_IDS.IMPACT_WIDE,
    framing: 'wide',
    movement: 'impact_hold',
    purpose: 'Show the full consequence of a collision before cutting to detail.',
    defaultFov: 68,
  }),
  [CINEMATIC_SHOT_IDS.FOCUS_INSERT]: Object.freeze({
    id: CINEMATIC_SHOT_IDS.FOCUS_INSERT,
    framing: 'insert',
    movement: 'locked_focus',
    purpose: 'Isolate a meaningful detail that motivates a transition or reveal.',
    defaultFov: 46,
  }),
});

export const CINEMATIC_TRANSITION_TEMPLATES = Object.freeze({
  [CINEMATIC_TRANSITION_IDS.CUT]: Object.freeze({
    id: CINEMATIC_TRANSITION_IDS.CUT,
    purpose: 'Immediate change for continuous action or a decisive beat.',
    runtimeSupport: 'ready',
  }),
  [CINEMATIC_TRANSITION_IDS.FADE_FROM_BLACK]: Object.freeze({
    id: CINEMATIC_TRANSITION_IDS.FADE_FROM_BLACK,
    purpose: 'Open a scene from darkness and establish a new beginning.',
    runtimeSupport: 'ready',
  }),
  [CINEMATIC_TRANSITION_IDS.FADE_TO_BLACK]: Object.freeze({
    id: CINEMATIC_TRANSITION_IDS.FADE_TO_BLACK,
    purpose: 'Close a sequence or create a clear break in time and place.',
    runtimeSupport: 'ready',
  }),
  [CINEMATIC_TRANSITION_IDS.DIP_TO_BLACK]: Object.freeze({
    id: CINEMATIC_TRANSITION_IDS.DIP_TO_BLACK,
    purpose: 'Briefly touch black between related shots without ending the whole sequence.',
    runtimeSupport: 'ready',
  }),
  [CINEMATIC_TRANSITION_IDS.DISSOLVE]: Object.freeze({
    id: CINEMATIC_TRANSITION_IDS.DISSOLVE,
    purpose: 'Blend related ideas, perspectives, memories, or passages of time.',
    runtimeSupport: 'requires_two_surfaces',
  }),
  [CINEMATIC_TRANSITION_IDS.POV_WAKE_BLINK]: Object.freeze({
    id: CINEMATIC_TRANSITION_IDS.POV_WAKE_BLINK,
    purpose: 'Fade in through first-person eyelid blinks to imply regaining consciousness.',
    runtimeSupport: 'ready',
  }),
  [CINEMATIC_TRANSITION_IDS.IRIS_FOCUS]: Object.freeze({
    id: CINEMATIC_TRANSITION_IDS.IRIS_FOCUS,
    purpose: 'Close the surrounding image while preserving one circular point of attention.',
    runtimeSupport: 'ready',
  }),
  [CINEMATIC_TRANSITION_IDS.IRIS_TO_BLACK]: Object.freeze({
    id: CINEMATIC_TRANSITION_IDS.IRIS_TO_BLACK,
    purpose: 'Close the remaining circular view completely to finish a transition.',
    runtimeSupport: 'ready',
  }),
  [CINEMATIC_TRANSITION_IDS.FLASH_CUT]: Object.freeze({
    id: CINEMATIC_TRANSITION_IDS.FLASH_CUT,
    purpose: 'Bridge an impact, burst of light, or abrupt loss of orientation.',
    runtimeSupport: 'ready',
  }),
  [CINEMATIC_TRANSITION_IDS.SOFT_BLUR_LOAD]: Object.freeze({
    id: CINEMATIC_TRANSITION_IDS.SOFT_BLUR_LOAD,
    purpose: 'Hold a readable image while a short asynchronous transition completes.',
    runtimeSupport: 'ready',
  }),
  [CINEMATIC_TRANSITION_IDS.WIPE]: Object.freeze({
    id: CINEMATIC_TRANSITION_IDS.WIPE,
    purpose: 'Move visibly between places or parallel actions with a directional edge.',
    runtimeSupport: 'requires_two_surfaces',
  }),
});

const SHAKE_TEMPLATES = Object.freeze({
  [CINEMATIC_SHAKE_IDS.NONE]: Object.freeze({
    amplitude: Object.freeze([0, 0, 0]),
    frequency: Object.freeze([0, 0, 0]),
    lookAmplitude: Object.freeze([0, 0, 0]),
  }),
  [CINEMATIC_SHAKE_IDS.BREATHING]: Object.freeze({
    amplitude: Object.freeze([0.006, 0.012, 0.004]),
    frequency: Object.freeze([1.7, 1.2, 1.4]),
    lookAmplitude: Object.freeze([0.004, 0.006, 0]),
  }),
  [CINEMATIC_SHAKE_IDS.ROTOR_CABIN]: Object.freeze({
    amplitude: Object.freeze([0.035, 0.018, 0.025]),
    frequency: Object.freeze([17, 23, 19]),
    lookAmplitude: Object.freeze([0.012, 0.008, 0.01]),
  }),
  [CINEMATIC_SHAKE_IDS.CRISIS]: Object.freeze({
    amplitude: Object.freeze([0.11, 0.065, 0.09]),
    frequency: Object.freeze([18, 24, 20]),
    lookAmplitude: Object.freeze([0.04, 0.025, 0.035]),
  }),
  [CINEMATIC_SHAKE_IDS.FREE_FALL]: Object.freeze({
    amplitude: Object.freeze([0.075, 0.055, 0.065]),
    frequency: Object.freeze([11, 16, 13]),
    lookAmplitude: Object.freeze([0.025, 0.02, 0.02]),
  }),
});

function clamp01(value) {
  return THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
}

function smooth(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function blinkPulse(progress, center, halfWidth) {
  const distance = Math.abs(progress - center) / halfWidth;
  return distance >= 1 ? 0 : smooth(1 - distance);
}

function asVector3(value) {
  if (value?.isVector3) return value.clone();
  if (Array.isArray(value)) return new THREE.Vector3(...value);
  return new THREE.Vector3();
}

export function createCinematicCameraPose({
  position,
  lookAt,
  fov,
  shotId = CINEMATIC_SHOT_IDS.ESTABLISHING_WIDE,
} = {}) {
  const template = CINEMATIC_SHOT_TEMPLATES[shotId]
    || CINEMATIC_SHOT_TEMPLATES[CINEMATIC_SHOT_IDS.ESTABLISHING_WIDE];
  return {
    position: asVector3(position),
    lookAt: asVector3(lookAt),
    fov: Number.isFinite(fov) ? fov : template.defaultFov,
    shotId: template.id,
  };
}

export function blendCinematicCameraPoses(from, to, progress, {
  easing = 'smooth',
  shotId = to?.shotId || from?.shotId,
} = {}) {
  const t = easing === 'linear' ? clamp01(progress) : smooth(progress);
  const start = createCinematicCameraPose(from);
  const end = createCinematicCameraPose(to);
  return createCinematicCameraPose({
    position: start.position.lerp(end.position, t),
    lookAt: start.lookAt.lerp(end.lookAt, t),
    fov: THREE.MathUtils.lerp(start.fov, end.fov, t),
    shotId,
  });
}

export function applyCinematicCameraShake(pose, {
  shakeId = CINEMATIC_SHAKE_IDS.NONE,
  elapsed = 0,
  intensity = 1,
} = {}) {
  const output = createCinematicCameraPose(pose);
  const template = SHAKE_TEMPLATES[shakeId] || SHAKE_TEMPLATES[CINEMATIC_SHAKE_IDS.NONE];
  const amount = Math.max(0, Number(intensity) || 0);
  const [ax, ay, az] = template.amplitude;
  const [fx, fy, fz] = template.frequency;
  const [lx, ly, lz] = template.lookAmplitude;

  output.position.add(new THREE.Vector3(
    Math.sin(elapsed * fx) * ax * amount,
    Math.sin(elapsed * fy + 0.7) * ay * amount,
    Math.cos(elapsed * fz + 0.2) * az * amount,
  ));
  output.lookAt.add(new THREE.Vector3(
    Math.sin(elapsed * (fx * 0.57) + 0.4) * lx * amount,
    Math.sin(elapsed * (fy * 0.43) + 1.1) * ly * amount,
    Math.cos(elapsed * (fz * 0.51) + 0.9) * lz * amount,
  ));
  return output;
}

export function sampleCinematicTransition(transitionId, progress, options = {}) {
  const p = clamp01(progress);
  const eased = smooth(p);
  const state = {
    solidBlackOpacity: 0,
    irisOpacity: 0,
    irisRadiusVmax: 100,
    irisFeatherVmax: 3,
    irisCenterX: Number.isFinite(options.centerX) ? options.centerX : 50,
    irisCenterY: Number.isFinite(options.centerY) ? options.centerY : 50,
    eyelidClosure: 0,
    blurPx: 0,
    flashOpacity: 0,
    mix: eased,
  };

  if (transitionId === CINEMATIC_TRANSITION_IDS.FADE_FROM_BLACK) {
    state.solidBlackOpacity = 1 - eased;
  } else if (transitionId === CINEMATIC_TRANSITION_IDS.FADE_TO_BLACK) {
    state.solidBlackOpacity = eased;
  } else if (transitionId === CINEMATIC_TRANSITION_IDS.DIP_TO_BLACK) {
    state.solidBlackOpacity = smooth(1 - Math.abs(p * 2 - 1));
  } else if (transitionId === CINEMATIC_TRANSITION_IDS.POV_WAKE_BLINK) {
    state.solidBlackOpacity = 1 - smooth(p / 0.34);
    state.eyelidClosure = Math.max(
      blinkPulse(p, 0.42, 0.075),
      blinkPulse(p, 0.62, 0.06),
      blinkPulse(p, 0.79, 0.045),
    );
  } else if (transitionId === CINEMATIC_TRANSITION_IDS.IRIS_FOCUS) {
    const endRadius = Number.isFinite(options.endRadiusVmax) ? options.endRadiusVmax : 24;
    state.irisOpacity = smooth(p / 0.12);
    state.irisRadiusVmax = THREE.MathUtils.lerp(100, Math.max(0, endRadius), eased);
    state.irisFeatherVmax = Number.isFinite(options.featherVmax) ? options.featherVmax : 3;
  } else if (transitionId === CINEMATIC_TRANSITION_IDS.IRIS_TO_BLACK) {
    const startRadius = Number.isFinite(options.startRadiusVmax) ? options.startRadiusVmax : 24;
    state.irisOpacity = 1;
    state.irisRadiusVmax = THREE.MathUtils.lerp(Math.max(0, startRadius), 0, eased);
    state.irisFeatherVmax = Number.isFinite(options.featherVmax) ? options.featherVmax : 2;
  } else if (transitionId === CINEMATIC_TRANSITION_IDS.FLASH_CUT) {
    state.flashOpacity = smooth(1 - Math.abs(p * 2 - 1));
  } else if (transitionId === CINEMATIC_TRANSITION_IDS.SOFT_BLUR_LOAD) {
    state.solidBlackOpacity = 0.18 + Math.sin(p * Math.PI) * 0.18;
    state.blurPx = Math.sin(p * Math.PI) * (Number(options.maxBlurPx) || 7);
  }

  return state;
}

export function getCinematicShotTemplate(id) {
  return CINEMATIC_SHOT_TEMPLATES[id] || null;
}

export function getCinematicTransitionTemplate(id) {
  return CINEMATIC_TRANSITION_TEMPLATES[id] || null;
}
