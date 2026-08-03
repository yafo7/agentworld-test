import * as THREE from 'three';
import {
  createFallbackBlockBoss,
  createFallbackStoryProtagonist,
  StoryActor,
} from '../entities/StoryActor.js';
import { ActZeroCrashStage } from './ActZeroCrashStage.js';
import { ActZeroOverlay } from './ActZeroOverlay.js';
import { ActZeroSoundscape } from './ActZeroSoundscape.js';
import { CINEMATIC_TRANSITION_IDS } from './cinematic/CinematicTemplateLibrary.js';
import { CHII_PLAYER_CHARACTER } from '../data/playerCharacter.js';

export const ACT_ZERO_PHASES = Object.freeze({
  PRELUDE: 'prelude',
  BOSS_REVEAL: 'boss_reveal',
  HEAD_SHAKE: 'head_shake',
  CABIN_TWO_SHOT: 'cabin_two_shot',
  BOSS_WARNING: 'boss_warning',
  PLAYER_SILENCE: 'player_silence',
  BOSS_EJECTION: 'boss_ejection',
  ANGEL_ARRIVAL: 'angel_arrival',
  WISH: 'wish',
  ACK: 'ack',
  GENERATING: 'generating',
  EJECTION: 'ejection',
  FREE_FALL: 'free_fall',
  IMPACT: 'impact',
  IRIS_FOCUS: 'iris_focus',
  FINAL_BLACK: 'final_black',
  COMPLETE: 'complete',
});

const DURATIONS = Object.freeze({
  [ACT_ZERO_PHASES.PRELUDE]: 3.2,
  [ACT_ZERO_PHASES.BOSS_REVEAL]: 1.8,
  [ACT_ZERO_PHASES.HEAD_SHAKE]: 1.6,
  [ACT_ZERO_PHASES.CABIN_TWO_SHOT]: 2.4,
  [ACT_ZERO_PHASES.BOSS_WARNING]: 3.2,
  [ACT_ZERO_PHASES.PLAYER_SILENCE]: 1.8,
  [ACT_ZERO_PHASES.BOSS_EJECTION]: 3.0,
  [ACT_ZERO_PHASES.ANGEL_ARRIVAL]: 3.0,
  [ACT_ZERO_PHASES.ACK]: 2.8,
  [ACT_ZERO_PHASES.GENERATING]: 3.6,
  [ACT_ZERO_PHASES.EJECTION]: 3.1,
  [ACT_ZERO_PHASES.FREE_FALL]: 9.0,
  [ACT_ZERO_PHASES.IMPACT]: 2.6,
  [ACT_ZERO_PHASES.IRIS_FOCUS]: 4.2,
  [ACT_ZERO_PHASES.FINAL_BLACK]: 2.0,
});

const NEXT_PHASE = Object.freeze({
  [ACT_ZERO_PHASES.PRELUDE]: ACT_ZERO_PHASES.BOSS_REVEAL,
  [ACT_ZERO_PHASES.BOSS_REVEAL]: ACT_ZERO_PHASES.HEAD_SHAKE,
  [ACT_ZERO_PHASES.HEAD_SHAKE]: ACT_ZERO_PHASES.CABIN_TWO_SHOT,
  [ACT_ZERO_PHASES.CABIN_TWO_SHOT]: ACT_ZERO_PHASES.BOSS_WARNING,
  [ACT_ZERO_PHASES.BOSS_WARNING]: ACT_ZERO_PHASES.PLAYER_SILENCE,
  [ACT_ZERO_PHASES.PLAYER_SILENCE]: ACT_ZERO_PHASES.BOSS_EJECTION,
  [ACT_ZERO_PHASES.BOSS_EJECTION]: ACT_ZERO_PHASES.ANGEL_ARRIVAL,
  [ACT_ZERO_PHASES.ANGEL_ARRIVAL]: ACT_ZERO_PHASES.WISH,
  [ACT_ZERO_PHASES.ACK]: ACT_ZERO_PHASES.GENERATING,
  [ACT_ZERO_PHASES.GENERATING]: ACT_ZERO_PHASES.EJECTION,
  [ACT_ZERO_PHASES.EJECTION]: ACT_ZERO_PHASES.FREE_FALL,
  [ACT_ZERO_PHASES.FREE_FALL]: ACT_ZERO_PHASES.IMPACT,
  [ACT_ZERO_PHASES.IMPACT]: ACT_ZERO_PHASES.IRIS_FOCUS,
  [ACT_ZERO_PHASES.IRIS_FOCUS]: ACT_ZERO_PHASES.FINAL_BLACK,
  [ACT_ZERO_PHASES.FINAL_BLACK]: ACT_ZERO_PHASES.COMPLETE,
});

const ANGEL_ASSETS = Object.freeze({
  modelPath: 'generated/story/act0/angel.json',
  animationPaths: {
    idle: 'generated/story/act0/angel_idle.json',
    talk: 'generated/story/act0/angel_talk.json',
    generating: 'generated/story/act0/angel_generating.json',
    falling: 'generated/story/act0/angel_falling.json',
    panic: 'generated/story/act0/angel_panic.json',
  },
});

const BOSS_ASSETS = Object.freeze({
  modelPath: 'generated/story/act0/boss/model.json',
  animationPaths: {
    idle: 'generated/story/act0/boss/idle.json',
    talk: 'generated/story/act0/boss/talk.json',
    panic: 'generated/story/act0/boss/panic.json',
  },
});

const PROTAGONIST_ASSETS = Object.freeze({
  modelPath: CHII_PLAYER_CHARACTER.model,
  animationPaths: {
    idle: CHII_PLAYER_CHARACTER.animations.idle,
    walk: CHII_PLAYER_CHARACTER.animations.walk,
    run: CHII_PLAYER_CHARACTER.animations.run,
    jump: CHII_PLAYER_CHARACTER.animations.jump,
    special: CHII_PLAYER_CHARACTER.animations.special,
    falling: CHII_PLAYER_CHARACTER.animations.jump,
  },
});

export class ActZeroCrashDirector {
  constructor({
    scene,
    camera,
    cameraController,
    input,
    player,
    storyState,
    onComplete = null,
  } = {}) {
    if (!scene || !camera || !cameraController || !input || !player || !storyState) {
      throw new TypeError('ActZeroCrashDirector requires scene, camera, cameraController, input, player, and storyState');
    }
    this.scene = scene;
    this.camera = camera;
    this.cameraController = cameraController;
    this.input = input;
    this.player = player;
    this.storyState = storyState;
    this.onComplete = onComplete;

    this.stage = null;
    this.actor = null;
    this.bossActor = null;
    this.protagonistActor = null;
    this.overlay = null;
    this.soundscape = null;
    this.prepared = false;
    this.active = false;
    this.phase = ACT_ZERO_PHASES.COMPLETE;
    this.phaseTime = 0;
    this.worldVisibility = null;
    this.sceneBackground = null;
    this.sceneFog = null;
    this.wishPending = false;
    this.freeFallLineShown = false;
    this.finishTimer = null;
    const requestedSpeed = Number(new URLSearchParams(globalThis.location?.search || '').get('act0-speed'));
    this.playbackRate = Number.isFinite(requestedSpeed)
      ? THREE.MathUtils.clamp(requestedSpeed, 1, 6)
      : 1;
  }

  async prepare() {
    if (this.prepared) return;
    this.stage = new ActZeroCrashStage();
    this.actor = new StoryActor({ scene: this.scene, targetHeight: 2.6 });
    this.bossActor = new StoryActor({
      scene: this.scene,
      targetHeight: 2.25,
      rootName: 'ActZeroBoss',
      actorLabel: 'Boss',
      fallbackFactory: createFallbackBlockBoss,
      spinningStates: [],
    });
    this.protagonistActor = new StoryActor({
      scene: this.scene,
      targetHeight: 2.15,
      rootName: 'ActZeroProtagonist',
      actorLabel: 'Protagonist',
      fallbackFactory: createFallbackStoryProtagonist,
      spinningStates: [],
    });
    this.stage.attachAngel(this.actor.root);
    this.stage.attachBoss(this.bossActor.root);
    this.stage.attachPlayer(this.protagonistActor.root);
    this.scene.add(this.stage.root);
    await Promise.all([
      this.actor.load(ANGEL_ASSETS).catch(error => {
        console.warn('[ActZero] Angel asset load failed, using code fallback:', error.message);
      }),
      this.bossActor.load(BOSS_ASSETS).catch(error => {
        console.warn('[ActZero] Boss asset load failed, using code fallback:', error.message);
      }),
      this.protagonistActor.load(PROTAGONIST_ASSETS).catch(error => {
        console.warn('[ActZero] Protagonist asset load failed, using code fallback:', error.message);
      }),
    ]);
    this.prepared = true;
  }

  async start({ force = false } = {}) {
    if (this.active) return true;
    if (!force && !this.storyState.shouldPlay()) return false;
    await this.prepare();

    this.storyState.start();
    this.worldVisibility = new Map();
    for (const child of this.scene.children) {
      if (child === this.stage.root) continue;
      this.worldVisibility.set(child, child.visible);
      child.visible = false;
    }
    this.sceneBackground = this.scene.background;
    this.sceneFog = this.scene.fog;
    this.scene.background = new THREE.Color(0x435966);
    this.scene.fog = new THREE.Fog(0x435966, 20, 190);
    this.stage.root.visible = true;

    this.overlay = new ActZeroOverlay();
    this.overlay.onSkip(() => this.skip());
    this.soundscape = new ActZeroSoundscape();
    this.input.setPointerLockEnabled(false);
    document.exitPointerLock?.();
    this.active = true;
    this._enterPhase(ACT_ZERO_PHASES.PRELUDE);

    const pose = this.stage.getCameraPose();
    this.cameraController.lockTo(pose.position, pose.lookAt, pose.fov);
    console.log('[ActZero] 第0幕：落难 started');
    return true;
  }

  isActive() {
    return this.active;
  }

  update(dt) {
    if (!this.active) return;
    const storyDt = Math.min(dt, 0.1) * this.playbackRate;
    this.phaseTime += storyDt;
    const duration = DURATIONS[this.phase] || 0;
    const progress = duration > 0 ? Math.min(1, this.phaseTime / duration) : 0;
    this.stage.setPhase(this.phase, progress);
    this.stage.update(storyDt);
    this.actor.update(storyDt);
    this.bossActor.update(storyDt);
    this.protagonistActor.update(storyDt);

    if (
      this.phase === ACT_ZERO_PHASES.FREE_FALL
      && progress >= 0.56
      && !this.freeFallLineShown
    ) {
      this.freeFallLineShown = true;
      this.overlay.hideStatus();
      this.overlay.showCaption('主角', '快点！再快点啊！监管要来了！');
    }

    if (this.phase === ACT_ZERO_PHASES.PRELUDE) {
      this.overlay.applyCinematicTransition(
        CINEMATIC_TRANSITION_IDS.POV_WAKE_BLINK,
        progress,
      );
    } else if (this.phase === ACT_ZERO_PHASES.IRIS_FOCUS) {
      this.overlay.applyCinematicTransition(
        CINEMATIC_TRANSITION_IDS.IRIS_FOCUS,
        progress,
        { endRadiusVmax: 24, featherVmax: 3 },
      );
    } else if (this.phase === ACT_ZERO_PHASES.FINAL_BLACK) {
      this.overlay.applyCinematicTransition(
        CINEMATIC_TRANSITION_IDS.IRIS_TO_BLACK,
        progress,
        { startRadiusVmax: 24, featherVmax: 2 },
      );
    }

    const next = NEXT_PHASE[this.phase];
    if (next && duration > 0 && this.phaseTime >= duration) {
      this._enterPhase(next);
    }
  }

  applyCamera() {
    if (!this.active || !this.stage) return;
    const pose = this.stage.getCameraPose();
    this.camera.position.copy(pose.position);
    this.camera.lookAt(pose.lookAt);
    if (Math.abs(this.camera.fov - pose.fov) > 0.01) {
      this.camera.fov = pose.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  _enterPhase(phase) {
    this.phase = phase;
    this.phaseTime = 0;
    this.stage?.setPhase(phase, 0);
    this.overlay?.setPhase(phase);

    if (![
      ACT_ZERO_PHASES.PRELUDE,
      ACT_ZERO_PHASES.IRIS_FOCUS,
      ACT_ZERO_PHASES.FINAL_BLACK,
    ].includes(phase)) {
      this.overlay?.clearCinematicTransition();
    }

    if (phase === ACT_ZERO_PHASES.PRELUDE) {
      this.overlay.applyCinematicTransition(CINEMATIC_TRANSITION_IDS.POV_WAKE_BLINK, 0);
      this.overlay.hideCaption();
      this.overlay.hideStatus();
      this.actor.play('idle');
      this.bossActor.play('idle');
      this.protagonistActor.play('idle');
      this.soundscape.setRotorUrgency(0.32);
    } else if (phase === ACT_ZERO_PHASES.BOSS_REVEAL) {
      this.overlay.hideCaption();
      this.bossActor.play('idle');
    } else if (phase === ACT_ZERO_PHASES.HEAD_SHAKE) {
      this.overlay.hideCaption();
      this.soundscape.setRotorUrgency(0.48);
    } else if (phase === ACT_ZERO_PHASES.CABIN_TWO_SHOT) {
      this.overlay.hideCaption();
      this.soundscape.setRotorUrgency(0.62);
    } else if (phase === ACT_ZERO_PHASES.BOSS_WARNING) {
      this.overlay.showCaption('老大', '快想想办法！我们现在很危险！');
      this.bossActor.play('talk');
      this.soundscape.setRotorUrgency(0.76);
    } else if (phase === ACT_ZERO_PHASES.PLAYER_SILENCE) {
      this.overlay.showCaption('主角', '……');
      this.bossActor.play('idle');
      this.soundscape.setRotorUrgency(0.82);
    } else if (phase === ACT_ZERO_PHASES.BOSS_EJECTION) {
      this.overlay.showCaption('老大', '啊！！！！');
      this.bossActor.play('panic');
      this.soundscape.setRotorUrgency(1);
      this.soundscape.playWhoosh(2.7);
    } else if (phase === ACT_ZERO_PHASES.ANGEL_ARRIVAL) {
      this.overlay.hideCaption();
      this.actor.play('talk');
      this.soundscape.setRotorUrgency(0.76);
    } else if (phase === ACT_ZERO_PHASES.WISH) {
      this._askForWish();
    } else if (phase === ACT_ZERO_PHASES.ACK) {
      this.overlay.showCaption('天使', '已收到你的请求，我正在全力生成！');
      this.overlay.showStatus('请求已收到');
      this.actor.play('talk');
      this.soundscape.setRotorUrgency(0.45);
    } else if (phase === ACT_ZERO_PHASES.GENERATING) {
      this.overlay.hideCaption();
      this.overlay.showStatus('天使正在全力生成');
      this.actor.play('generating');
      this.soundscape.setRotorUrgency(0.8);
    } else if (phase === ACT_ZERO_PHASES.EJECTION) {
      this.overlay.hideCaption();
      this.overlay.showStatus('仍在生成中');
      this.actor.play('panic');
      this.protagonistActor.play('falling');
      this.soundscape.setRotorUrgency(1);
      this.soundscape.playWhoosh(3.2);
    } else if (phase === ACT_ZERO_PHASES.FREE_FALL) {
      this.freeFallLineShown = false;
      this.overlay.showStatus('天使还在生成');
      this.actor.play('falling');
      this.soundscape.playWhoosh(5.5);
    } else if (phase === ACT_ZERO_PHASES.IMPACT) {
      this.overlay.setSkipVisible(false);
      this.overlay.hideStatus();
      this.overlay.showCaption('主角', '饿啊！！！！');
      this.soundscape.playSplash();
    } else if (phase === ACT_ZERO_PHASES.IRIS_FOCUS) {
      this.scene.background = new THREE.Color(0x071823);
      this.scene.fog = new THREE.Fog(0x071823, 8, 70);
      this.overlay.applyCinematicTransition(
        CINEMATIC_TRANSITION_IDS.IRIS_FOCUS,
        0,
        { endRadiusVmax: 24, featherVmax: 3 },
      );
      this.overlay.hideStatus();
      this.overlay.hideCaption();
    } else if (phase === ACT_ZERO_PHASES.FINAL_BLACK) {
      this.overlay.applyCinematicTransition(
        CINEMATIC_TRANSITION_IDS.IRIS_TO_BLACK,
        0,
        { startRadiusVmax: 24, featherVmax: 2 },
      );
    } else if (phase === ACT_ZERO_PHASES.COMPLETE) {
      this._finish();
    }
  }

  _askForWish() {
    if (this.wishPending) return;
    this.wishPending = true;
    this.actor.play('idle');
    this.overlay.askWish({
      speaker: '天使',
      text: '看起来马上要坠机了，快想想有什么能救下你呢？',
      placeholder: '例如：一个巨大的降落伞',
    }).then(async wish => {
      this.wishPending = false;
      if (!this.active || this.phase !== ACT_ZERO_PHASES.WISH || !wish) return;
      this.storyState.recordWish(wish);
      await this.soundscape.unlock().catch(() => false);
      this._enterPhase(ACT_ZERO_PHASES.ACK);
    });
  }

  skip() {
    if (!this.active) return;
    this.overlay.setFade(1, 180);
    setTimeout(() => this._finish({ skipped: true }), 190);
  }

  async replay() {
    if (this.active) return false;
    this.storyState.reset();
    return this.start({ force: true });
  }

  _finish({ skipped = false } = {}) {
    if (!this.active) return;
    this.active = false;
    this.storyState.complete();
    this.soundscape?.dispose();
    this.soundscape = null;

    if (this.worldVisibility) {
      for (const [child, visible] of this.worldVisibility) child.visible = visible;
    }
    this.worldVisibility = null;
    this.scene.background = this.sceneBackground;
    this.scene.fog = this.sceneFog;
    this.cameraController.unlock(60);
    this.input.setPointerLockEnabled(true);

    this.actor?.dispose();
    this.actor = null;
    this.bossActor?.dispose();
    this.bossActor = null;
    this.protagonistActor?.dispose();
    this.protagonistActor = null;
    this.stage?.dispose();
    this.stage = null;
    this.prepared = false;

    const overlay = this.overlay;
    this.overlay = null;
    overlay?.clearCinematicTransition();
    overlay?.setFade(1, skipped ? 0 : 180);
    this.finishTimer = setTimeout(() => {
      overlay?.setFade(0, 900);
      setTimeout(() => overlay?.dispose(), 950);
    }, skipped ? 0 : 550);
    this.onComplete?.({ skipped, story: this.storyState.getSnapshot() });
    console.log(`[ActZero] 第0幕 complete${skipped ? ' (skipped)' : ''}`);
  }

  dispose() {
    clearTimeout(this.finishTimer);
    if (this.active) this._finish({ skipped: true });
    this.overlay?.dispose();
    this.actor?.dispose();
    this.bossActor?.dispose();
    this.protagonistActor?.dispose();
    this.stage?.dispose();
  }
}

export const ACT_ZERO_ANGEL_ASSETS = ANGEL_ASSETS;
export const ACT_ZERO_BOSS_ASSETS = BOSS_ASSETS;
export const ACT_ZERO_PROTAGONIST_ASSETS = PROTAGONIST_ASSETS;
