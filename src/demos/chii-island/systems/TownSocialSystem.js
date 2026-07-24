import * as THREE from 'three';
import { ParticleSystem } from '../../../engine/animation/particles.js';
import { buildModelFromJson } from '../../../engine/model/builder.js';
import { StaticEntity } from '../../../engine/entity/StaticEntity.js';
import { AIWorldActionService } from '../../../gameplay/ai/AIWorldActionService.js';
import { PET_STATES, getPetStateMachine } from '../../../gameplay/pets/PetStateMachine.js';
import { ActivityReservationService } from '../../../gameplay/social/ActivityReservationService.js';
import { SocialActivityPlanner } from '../../../gameplay/social/SocialActivityPlanner.js';
import { SocialEventCoordinator } from '../../../gameplay/social/SocialEventCoordinator.js';
import { validateActivityPlan } from '../../../gameplay/social/ActivityPlanValidator.js';
import { TownActivityAssetCache } from '../../../storage/TownActivityAssetCache.js';
import { TownSocialMemory } from '../../../gameplay/social/TownSocialMemory.js';
import { TownSocialDirector } from './TownSocialDirector.js';
import { TownSocialCuePresenter } from '../presentation/TownSocialCuePresenter.js';
import {
  createPresetTownActivity,
  getTownActivityDefinition,
  TOWN_SOCIAL_DIALOGUE,
} from '../data/townSocialActivities.js';

const ONE_SHOT_TYPES = new Set(['apple_pick', 'greeting', 'custom_daily']);
const FESTIVAL_TYPES = new Set(['party', 'birthday', 'new_year', 'custom_festival']);

const CURATED_PET_IDS = new Set(['momo', 'mako', 'yafo', 'lingq', 'fangk', 'mok', 'crab']);

function normalizePetId(value) {
  const id = String(value || '').trim();
  return id === 'fangke' ? 'fangk' : id;
}

function petId(pet) {
  const profileId = normalizePetId(pet?._profile?.id);
  if (CURATED_PET_IDS.has(profileId)) return profileId;
  const gameplayId = normalizePetId(pet?._petName || pet?.mesh?.name);
  if (CURATED_PET_IDS.has(gameplayId)) return gameplayId;
  return normalizePetId(pet?._petId) || gameplayId || 'pet';
}

function petName(pet) {
  return pet?._petName || petId(pet);
}

function uniquePets(pets) {
  const seen = new Set();
  return (pets || []).filter(pet => {
    const id = petId(pet);
    if (!pet || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function modelRevision(modelJson) {
  const text = JSON.stringify(modelJson || {});
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function ringSlots(center, count, radius, startAngle = -Math.PI / 2) {
  return Array.from({ length: count }, (_, index) => {
    const angle = startAngle + (index / Math.max(count, 1)) * Math.PI * 2;
    return center.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  });
}

function safePlan(plan, loop, duration) {
  if (!plan) return null;
  return { ...plan, _duration: duration, _loop: loop };
}

export class TownSocialSystem {
  constructor({
    scene,
    player,
    petManager,
    participants,
    center,
    worldObjects,
    objectPlacement,
    contentPort,
    generatedAssetRepository,
    runtimeStatus = null,
    activityAssetCache = null,
    socialMemory = null,
    socialDirector = null,
    cuePresenter = null,
    camera = null,
    vfxService = null,
  }) {
    this.scene = scene;
    this.player = player;
    this.petManager = petManager;
    this.participants = uniquePets(participants);
    this.center = center.clone();
    this.worldObjects = worldObjects;
    this.objectPlacement = objectPlacement;
    this.contentPort = contentPort;
    this.generatedAssetRepository = generatedAssetRepository;
    this.runtimeStatus = runtimeStatus;
    this.vfxService = vfxService;
    this.organizer = this.participants.find(pet => petId(pet) === 'fangk') || this.participants[0];

    this.planner = new SocialActivityPlanner({ contentPort });
    this.reservations = new ActivityReservationService();
    this.coordinator = new SocialEventCoordinator({ petManager });
    this.aiActions = new AIWorldActionService({ contentPort, assetRepository: generatedAssetRepository });
    this.activityAssetCache = activityAssetCache || new TownActivityAssetCache({
      assetRepository: generatedAssetRepository,
    });
    this.socialMemory = socialMemory || new TownSocialMemory();
    this.socialDirector = socialDirector || new TownSocialDirector({
      participants: this.participants,
      worldObjects,
      memory: this.socialMemory,
    });
    this.cues = cuePresenter || new TownSocialCuePresenter({ camera, vfxService });
    this.activeActivity = null;
    this.preparedActivity = null;
    this.particleBindings = [];
    this.eventProps = [];
    this.temporaryPetModels = new Map();
    this.temporaryWorldModels = new Map();
    this.generationToken = 0;
    this.lastNotice = null;
    this.autonomousEnabled = false;

    this.socialEmitter = new THREE.Object3D();
    this.socialEmitter.name = 'socialEmitter';
    this.socialEmitter.position.copy(this.center);
    this.scene.add(this.socialEmitter);

    this.data = {
      type: 'social_activity',
      participants: this.participants.map(pet => petName(pet)),
      location: 'church_square',
      active: null,
    };
  }

  isTownPet(pet) {
    return this.participants.includes(pet);
  }

  addParticipant(pet) {
    if (!pet || this.isTownPet(pet)) return false;
    this.participants.push(pet);
    this.data.participants = this.participants.map(participant => petName(participant));
    return true;
  }

  canInteract(pet) {
    if (!this.isTownPet(pet)) return false;
    if (this.activeActivity) return pet === this.organizer;
    const state = getPetStateMachine(pet);
    return state.is(PET_STATES.FREE_ROAM) || state.is(PET_STATES.FOLLOWING);
  }

  getInteractionLabel(pet) {
    if (this.activeActivity && pet === this.organizer) {
      return this.activeActivity.plan.autoEnd
        ? `问问${petName(pet)}活动进展`
        : `和${petName(pet)}商量活动收尾`;
    }
    const opportunity = this.socialDirector.getOpportunity(pet);
    return opportunity
      ? `听听${petName(pet)}的主意`
      : `与${petName(pet)}聊聊`;
  }

  async interact(pet, dialogueSystem) {
    if (!this.canInteract(pet)) return false;
    if (this.activeActivity) return this._interactActive(dialogueSystem);
    return this._interactIdle(pet, dialogueSystem);
  }

  async _interactIdle(pet, dialogueSystem) {
    const opportunity = this.socialDirector.getOpportunity(pet);
    const dialogueSnapshot = this._beginPetDialogue(pet);
    let restored = false;
    try {
      const profile = this._dialogueProfile(pet);
      const options = this._idleOptions(
        pet,
        dialogueSnapshot.state === PET_STATES.FOLLOWING,
        opportunity,
      );
      const choice = await dialogueSystem.askChoice({
        speakerName: petName(pet),
        text: this.lastNotice || opportunity?.proposal || profile.idle,
        options,
      });
      this.lastNotice = null;
      if (!choice) return false;

      if (choice.key === 'follow') {
        restored = true;
        const machine = getPetStateMachine(pet);
        machine.transition(PET_STATES.FOLLOWING, { reason: 'town-follow-requested' });
        machine.resumeState = null;
        pet.followTarget?.(this.player.mesh, 3, 6);
        return true;
      }
      if (choice.key === 'free_roam') {
        restored = true;
        const machine = getPetStateMachine(pet);
        machine.transition(PET_STATES.FREE_ROAM, { reason: 'town-free-roam-requested' });
        machine.resumeState = null;
        this.petManager.resumePet(pet);
        return true;
      }
      if (choice.key === 'chat') {
        await dialogueSystem.say({
          speakerName: petName(pet),
          text: profile.smallTalk || TOWN_SOCIAL_DIALOGUE.generic.smallTalk,
        });
        return false;
      }

      let plan = null;
      if (choice.key === 'custom_daily') {
        plan = await this._requestCustomDailyPlan(pet, dialogueSystem);
      } else if (choice.key === 'custom_festival') {
        plan = await this._requestCustomFestivalPlan(dialogueSystem);
      } else {
        plan = this._createPresetPlan(choice.key, pet);
      }
      if (!plan) return false;

      const startLine = this._startLineFor(choice.key, pet);
      const accepted = await dialogueSystem.say({ speakerName: petName(pet), text: startLine });
      if (!accepted) return false;

      this._restorePetDialogue(dialogueSnapshot);
      restored = true;
      return this._beginActivity(plan);
    } finally {
      if (!restored) this._restorePetDialogue(dialogueSnapshot);
    }
  }

  async _interactActive(dialogueSystem) {
    const dialogueSnapshot = this._beginPetDialogue(this.organizer);
    let restored = false;
    const restoreDialogue = () => {
      if (restored) return;
      this._restorePetDialogue(dialogueSnapshot);
      restored = true;
    };

    try {
      const activity = this.activeActivity;
      if (activity.plan.autoEnd && activity.status !== 'preparing') {
        await dialogueSystem.say({
          speakerName: petName(this.organizer),
          text: activity.status === 'preparing'
            ? TOWN_SOCIAL_DIALOGUE.fangk.preparing
            : '这个小活动马上就好，让他们把动作做完吧。',
        });
        restoreDialogue();
        this._resumeOrganizerPerformance();
        return false;
      }
      const text = activity.status === 'preparing'
        ? TOWN_SOCIAL_DIALOGUE.fangk.preparing
        : TOWN_SOCIAL_DIALOGUE.fangk.active;
      const choice = await dialogueSystem.askChoice({
        speakerName: petName(this.organizer),
        text,
        options: [
          { key: 'continue', label: '再玩一会儿！' },
          { key: 'end', label: '今天先到这里吧！' },
        ],
      });

      if (choice?.key !== 'end') {
        await dialogueSystem.say({
          speakerName: petName(this.organizer),
          text: TOWN_SOCIAL_DIALOGUE.fangk.continue,
        });
        restoreDialogue();
        this._resumeOrganizerPerformance();
        return false;
      }

      await dialogueSystem.say({
        speakerName: petName(this.organizer),
        text: activity.plan.dialogue?.end || TOWN_SOCIAL_DIALOGUE.fangk.end,
      });
      restoreDialogue();
      this.stopActivity('host-ended');
      return true;
    } finally {
      restoreDialogue();
    }
  }

  _idleOptions(pet, wasFollowing, opportunity = this.socialDirector.getOpportunity(pet)) {
    return this._idleOptionsForOpportunity(pet, wasFollowing, opportunity);
  }

  _idleOptionsForOpportunity(pet, wasFollowing, opportunity) {
    const stateOption = wasFollowing
      ? { key: 'free_roam', label: '先在广场自由活动吧！' }
      : { key: 'follow', label: '和我一起逛逛吧！' };
    const id = petId(pet);
    if (id === 'fangk') {
      return [
        opportunity
          ? { key: opportunity.type, label: opportunity.acceptLabel }
          : { key: 'chat', label: '聊聊今天的广场' },
        { key: 'custom_festival', label: '我想策划一个新节日！' },
        stateOption,
      ];
    }
    return [
      opportunity
        ? { key: opportunity.type, label: opportunity.acceptLabel }
        : { key: 'chat', label: '聊聊刚才在做什么' },
      { key: 'custom_daily', label: '我有个小活动点子！' },
      stateOption,
    ];
  }

  _dialogueProfile(pet) {
    const id = petId(pet);
    return TOWN_SOCIAL_DIALOGUE[id] || TOWN_SOCIAL_DIALOGUE.generic;
  }

  _startLineFor(type, pet) {
    const profile = this._dialogueProfile(pet);
    if (type === 'custom_festival') return TOWN_SOCIAL_DIALOGUE.fangk.custom;
    const definition = getTownActivityDefinition(type);
    if (definition) return definition.dialogue.accept;
    return profile.custom || TOWN_SOCIAL_DIALOGUE.generic.custom;
  }

  _beginPetDialogue(pet) {
    const machine = getPetStateMachine(pet);
    const snapshot = {
      pet,
      state: machine.current,
      followTarget: pet._followTarget,
      followDistance: pet._followDistance,
      followSpeed: pet._followSpeed,
    };
    machine.enterTemporary(PET_STATES.INTERACTING, snapshot.state);
    pet.stopWalking?.();
    return snapshot;
  }

  _restorePetDialogue(snapshot) {
    const machine = getPetStateMachine(snapshot.pet);
    if (machine.is(PET_STATES.INTERACTING)) machine.resume('town-dialogue-ended');
    if (snapshot.state === PET_STATES.FOLLOWING && snapshot.followTarget) {
      snapshot.pet.followTarget?.(
        snapshot.followTarget,
        snapshot.followDistance || 3,
        snapshot.followSpeed || 6,
      );
    } else if (snapshot.state === PET_STATES.FREE_ROAM) {
      this.petManager.resumePet(snapshot.pet);
    }
  }

  _createPresetPlan(type, initiator) {
    const definition = getTownActivityDefinition(type);
    if (!definition) return null;
    const participants = uniquePets(this.socialDirector.participantsFor(definition)).slice(0, 6);
    const targetObjectIds = this.socialDirector.targetsFor(definition).map(entity => this._objectId(entity));

    const raw = createPresetTownActivity(type, {
      initiatorId: petId(initiator) || definition.initiatorId,
      participantIds: participants.map(petId),
      subjectId: definition.subjectId || null,
      targetObjectIds,
    });
    return this._validatePlan(raw);
  }

  async _requestCustomDailyPlan(pet, dialogueSystem) {
    const concept = await dialogueSystem.askInput({
      speakerName: petName(pet),
      text: '说说看！你想让我们做什么小活动？',
      placeholder: '例如：和mako一起转圈玩',
    });
    if (!concept) return null;
    await dialogueSystem.say({
      speakerName: petName(pet),
      text: '让我想一想……我的小脑袋正在把点子排成队！',
    });

    const jobId = this.runtimeStatus?.startJob('策划城镇小活动', '正在听懂你的点子');
    try {
      const plan = await this.planner.planDaily({
        concept,
        initiatorId: petId(pet),
        pets: this._plannerPets(),
        objects: this._plannerObjects(),
      });
      this.runtimeStatus?.completeJob(jobId, '小活动计划完成');
      const confirmation = await dialogueSystem.askChoice({
        speakerName: petName(pet),
        text: `我想好了，叫“${plan.title}”！现在就试试吗？`,
        options: [
          { key: 'confirm', label: '就这么办！' },
          { key: 'cancel', label: '先把点子放进口袋' },
        ],
      });
      return confirmation?.key === 'confirm' ? plan : null;
    } catch (error) {
      this.runtimeStatus?.failJob(jobId, error);
      await dialogueSystem.say({
        speakerName: petName(pet),
        text: '点子刚才打了个结。没关系，我们抖一抖，下次再试！',
      });
      return null;
    }
  }

  async _requestCustomFestivalPlan(dialogueSystem) {
    const concept = await dialogueSystem.askInput({
      speakerName: petName(this.organizer),
      text: '你想在岛上办一个什么节日？',
      placeholder: '例如：云朵甜点节',
    });
    if (!concept) return null;
    await dialogueSystem.say({
      speakerName: petName(this.organizer),
      text: '收到！我的计划本已经兴奋得开始自己翻页了。',
    });

    const jobId = this.runtimeStatus?.startJob('策划奇异岛新节日', 'fangk正在安排节目');
    try {
      const plan = await this.planner.planFestival({
        concept,
        pets: this._plannerPets(),
        objects: this._plannerObjects(),
      });
      this.runtimeStatus?.completeJob(jobId, '节日计划完成');
      const confirmation = await dialogueSystem.askChoice({
        speakerName: petName(this.organizer),
        text: `计划完成！“${plan.title}”需要${plan.participants.length}位小伙伴和${plan.props.length}件道具。开场吗？`,
        options: [
          { key: 'confirm', label: '开场吧！' },
          { key: 'cancel', label: '先把计划夹进本子里' },
        ],
      });
      return confirmation?.key === 'confirm' ? plan : null;
    } catch (error) {
      this.runtimeStatus?.failJob(jobId, error);
      await dialogueSystem.say({
        speakerName: petName(this.organizer),
        text: '计划本刚刚打了个喷嚏，节目顺序全飞了。我们下次再排！',
      });
      return null;
    }
  }

  _beginActivity(plan) {
    if (this.activeActivity) return false;
    this.cues.clearHint();
    const resources = [
      `location:${plan.locationId}`,
      ...plan.participants.map(id => `pet:${id}`),
      ...plan.targetObjectIds.map(id => `object:${id}`),
    ];
    const reservation = this.reservations.tryReserve(plan.id, resources);
    if (!reservation.ok) {
      this.lastNotice = '有位小伙伴已经在忙啦。fangk说活动不能像帽子一样叠着戴。';
      return false;
    }

    const token = ++this.generationToken;
    const jobId = this.runtimeStatus?.startJob(plan.title, '正在准备活动');
    this.activeActivity = {
      plan,
      status: 'preparing',
      token,
      jobId,
      elapsed: 0,
      ambientIndex: 0,
      nextAmbientAt: 4.5,
    };
    this.socialMemory.recordStarted(plan.type, plan.initiatorId);
    this.data.active = { id: plan.id, type: plan.type, status: 'preparing' };
    this.runtimeStatus?.setActivityStatus(plan.title, '准备中 · 找fangk可以取消');

    this._prepareActivity(plan, token)
      .then(prepared => {
        if (!this._isCurrentToken(token)) return;
        this._startPreparedActivity(prepared);
      })
      .catch(error => this._failActivity(error, token));
    return true;
  }

  async _prepareActivity(plan, token) {
    this.runtimeStatus?.updateJob(this.activeActivity?.jobId, '正在准备服装和道具');
    const prepared = {
      plan,
      props: [],
      petMounts: [],
      worldMounts: [],
      animations: new Map(),
      introAnimations: new Map(),
      maxActionDuration: 3,
    };

    if (plan.type === 'birthday') {
      const subject = this._petById(plan.subjectId || 'mako');
      if (subject) {
        const mount = await this._preparePetMount(subject, '一顶彩色生日礼帽带金色小星星', '头顶', token);
        if (mount) prepared.petMounts.push(mount);
      }
    }
    if (plan.type === 'new_year') {
      const clothing = await Promise.allSettled(
        plan.participants.map(id => this._preparePetMount(
          this._petById(id),
          '红色新年小棉袄配金色围巾',
          '身体和颈部',
          token,
        )),
      );
      prepared.petMounts.push(...clothing.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []));

      const worldTargets = [this._appleTrees()[0], this._church()].filter(Boolean);
      const lanterns = await Promise.allSettled(worldTargets.map((target, index) => this._prepareWorldMount(
        target,
        '红色方形灯笼配金色流苏',
        index === 0 ? '树枝上' : '正门两侧',
        token,
      )));
      prepared.worldMounts.push(...lanterns.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []));
    }

    this.runtimeStatus?.updateJob(this.activeActivity?.jobId, '正在摆放活动道具');
    for (let index = 0; index < plan.props.length; index += 1) {
      try {
        const prop = await this._spawnEventProp(plan.props[index], plan, index, token);
        if (prop) prepared.props.push(prop);
      } catch (error) {
        console.warn('[TownSocial] Event prop skipped:', error.message);
      }
    }

    this.runtimeStatus?.updateJob(this.activeActivity?.jobId, '正在生成宠物动作');
    const modelOverrides = new Map(prepared.petMounts.map(mount => [petId(mount.pet), mount.modelJson]));
    const animationResults = await Promise.all(plan.participants.map(async id => {
      const pet = this._petById(id);
      if (!pet) return null;
      const loop = !ONE_SHOT_TYPES.has(plan.type);
      const duration = loop ? 3 : 2.6;
      const animation = await this._getActivityAnimation(pet, plan.actionPrompts[id], {
        duration,
        loop,
        emitParticles: FESTIVAL_TYPES.has(plan.type),
        modelJson: modelOverrides.get(id) || pet._originalModelJson,
        token,
      });
      return animation ? [id, animation] : null;
    }));
    for (const result of animationResults.filter(Boolean)) {
      prepared.animations.set(result[0], result[1]);
      prepared.maxActionDuration = Math.max(prepared.maxActionDuration, result[1].duration);
    }

    if (plan.type === 'birthday' && this.organizer) {
      const push = await this._getActivityAnimation(this.organizer, '双手向前推蛋糕桌', {
        duration: 2.8,
        loop: false,
        emitParticles: false,
        modelJson: this.organizer._originalModelJson,
        token,
      });
      if (push) prepared.introAnimations.set(petId(this.organizer), push);
    }

    if (plan.type === 'new_year') {
      const firecracker = prepared.props.find(prop => prop.spec.id === 'firecracker');
      if (firecracker) await this._preparePropAnimation(firecracker, '鞭炮闪光冒金纸屑', token);
    }

    if (!this._isCurrentToken(token)) throw new Error('Activity preparation was cancelled');
    prepared.focus = this._focusFor(plan, prepared);
    prepared.slots = this._slotsFor(plan, prepared.focus, prepared);
    return prepared;
  }

  _startPreparedActivity(prepared) {
    const activity = this.activeActivity;
    if (!activity || activity.plan.id !== prepared.plan.id) return;
    this.preparedActivity = prepared;
    activity.status = 'gathering';
    activity.elapsed = 0;
    this.data.active.status = 'gathering';
    this.runtimeStatus?.setActivityStatus(
      prepared.plan.title,
      prepared.plan.autoEnd ? '正在集合' : '正在集合 · 找fangk可以结束',
    );

    for (const mount of prepared.worldMounts) this._applyWorldMount(mount);
    if (prepared.plan.type === 'new_year') {
      for (const mount of prepared.petMounts) this._applyPetMount(mount);
    }
    this.runtimeStatus?.completeJob(activity.jobId, prepared.plan.dialogue.ready);

    const participants = prepared.plan.participants.map(id => this._petById(id)).filter(Boolean);
    this.coordinator.start({
      plan: prepared.plan,
      participants,
      slots: prepared.slots,
      onPerform: () => this._performPreparedActivity(prepared),
      onFinish: () => this._cleanupActivityVisuals(),
    });
  }

  _performPreparedActivity(prepared) {
    const activity = this.activeActivity;
    if (!activity) return;
    activity.status = prepared.plan.type === 'birthday' ? 'birthday_intro' : 'performing';
    activity.elapsed = 0;
    this.data.active.status = activity.status;
    this.runtimeStatus?.setActivityStatus(
      prepared.plan.title,
      prepared.plan.autoEnd ? '小活动进行中' : '活动进行中 · 找fangk结束',
    );

    if (prepared.plan.type === 'birthday') {
      this._startBirthdayIntro(prepared);
      return;
    }
    this._beginMainPerformance(prepared);
  }

  _startBirthdayIntro(prepared) {
    const table = prepared.props.find(prop => prop.spec.id === 'birthday_table');
    const organizerAnimation = prepared.introAnimations.get(petId(this.organizer));
    if (organizerAnimation) this.organizer.playAnimation?.(organizerAnimation.key);
    if (!table) {
      this._finishBirthdayIntro(prepared);
      return;
    }

    table.finalPosition = table.entity.mesh.position.clone();
    table.startPosition = table.finalPosition.clone().add(new THREE.Vector3(0, 0, 5.5));
    table.entity.mesh.position.copy(table.startPosition);
    table.pushPetStart = this.organizer.mesh.position.clone();
    table.pushPetEnd = table.finalPosition.clone().add(new THREE.Vector3(0, 0, 2.4));
    this.organizer.lockFacing?.(table.finalPosition.x, table.finalPosition.z);
  }

  _finishBirthdayIntro(prepared) {
    for (const mount of prepared.petMounts) this._applyPetMount(mount);
    this._beginMainPerformance(prepared);
  }

  _beginMainPerformance(prepared) {
    const activity = this.activeActivity;
    if (!activity) return;
    activity.status = 'performing';
    activity.elapsed = 0;
    this.data.active.status = 'performing';
    this.runtimeStatus?.setActivityStatus(
      prepared.plan.title,
      prepared.plan.autoEnd ? '小活动进行中' : '活动进行中 · 找fangk结束',
    );
    this._disposeParticles();

    if (this._hasBeat(prepared.plan, 'opening') || this._hasBeat(prepared.plan, 'perform')) {
      const announcer = this._petById(prepared.plan.initiatorId) || this.organizer;
      this.cues.showLine(announcer, prepared.plan.dialogue.ready, 2.8);
    }

    for (const id of prepared.plan.participants) {
      const pet = this._petById(id);
      const animation = prepared.animations.get(id);
      if (!pet) continue;
      pet.stopWalking?.();
      pet.lockFacing?.(prepared.focus.x, prepared.focus.z);
      pet.playAnimation?.(animation?.key || this._fallbackAnimationName(pet, prepared.plan.type));
      if (animation?.plan && pet._modelGroup) this._addParticles(animation.plan, pet._modelGroup);
    }

    if (FESTIVAL_TYPES.has(prepared.plan.type)) {
      this.socialEmitter.position.copy(prepared.focus);
      this.vfxService?.playPreset('celebration', {
        target: this.socialEmitter,
        key: 'town-social-celebration',
        duration: prepared.plan.autoEnd ? 10 : Infinity,
      });
    }
    for (const prop of prepared.props) {
      if (!prop.animationPlan) continue;
      prop.entity.playIdleAnimation(prop.animationPlan, prop.animationPlan._duration || 2.8);
      if (prop.entity._modelGroup) this._addParticles(prop.animationPlan, prop.entity._modelGroup);
    }
  }

  update(dt) {
    this.coordinator.update(dt);
    for (const binding of this.particleBindings) binding.system.update(dt, binding.root);
    this.cues.update(dt);

    const activity = this.activeActivity;
    const prepared = this.preparedActivity;
    if (!activity) {
      const featured = this.socialDirector.getFeatured(this.player.mesh.position);
      if (featured) this.cues.setHint(featured.pet, '我有个想法！');
      else this.cues.clearHint();
      return;
    }
    this.cues.clearHint();
    if (!prepared) return;
    activity.elapsed += dt;

    if (activity.status === 'birthday_intro') {
      const table = prepared.props.find(prop => prop.spec.id === 'birthday_table');
      if (!table?.finalPosition || !table.startPosition) {
        this._finishBirthdayIntro(prepared);
        return;
      }
      const progress = Math.min(1, activity.elapsed / 2.8);
      table.entity.mesh.position.lerpVectors(table.startPosition, table.finalPosition, progress);
      if (table.pushPetStart && table.pushPetEnd) {
        this.organizer.mesh.position.lerpVectors(table.pushPetStart, table.pushPetEnd, progress);
      }
      if (progress >= 1) this._finishBirthdayIntro(prepared);
      return;
    }

    if (activity.status === 'performing') {
      this._updateFestivalBarks(activity, prepared);
      const duration = Math.max(prepared.maxActionDuration, prepared.plan.performanceDuration || 0);
      if (prepared.plan.autoEnd && activity.elapsed >= duration) {
        if (this._hasBeat(prepared.plan, 'wind_down')) this._beginWindDown(activity, prepared);
        else this.stopActivity('auto-completed');
      }
      return;
    }

    if (activity.status === 'wind_down' && activity.elapsed >= 2.8) {
      this.stopActivity('auto-completed');
    }
  }

  _beginWindDown(activity, prepared) {
    activity.status = 'wind_down';
    activity.elapsed = 0;
    this.data.active.status = 'wind_down';
    for (const id of prepared.plan.participants) this._petById(id)?.playAnimation?.('idle');
    const reaction = prepared.plan.dialogue.reaction;
    if (reaction && this._hasBeat(prepared.plan, 'reaction')) {
      this.cues.showLine(this._petById(reaction.speakerId), reaction.text, 2.6);
    } else {
      const initiator = this._petById(prepared.plan.initiatorId) || this.organizer;
      this.cues.showLine(initiator, prepared.plan.dialogue.end, 2.6);
    }
    this.runtimeStatus?.setActivityStatus(prepared.plan.title, '大家正在自然散场');
  }

  _updateFestivalBarks(activity, prepared) {
    if (
      prepared.plan.autoEnd
      || !this._hasBeat(prepared.plan, 'festival_hold')
      || activity.elapsed < activity.nextAmbientAt
    ) return;
    const lines = prepared.plan.dialogue.ambient || [];
    if (lines.length > 0) {
      const line = lines[activity.ambientIndex % lines.length];
      activity.ambientIndex += 1;
      this.cues.showLine(this._petById(line.speakerId), line.text, 3.2);
    }
    activity.nextAmbientAt += 5.5;
  }

  _hasBeat(plan, beat) {
    return plan.beats?.includes(beat) ?? false;
  }

  stopActivity(reason = 'host-ended') {
    const activity = this.activeActivity;
    if (!activity) return false;
    ++this.generationToken;
    if (!this.coordinator.finish(reason)) this._cleanupActivityVisuals();
    this.runtimeStatus?.completeJob(
      activity.jobId,
      reason === 'host-ended' ? '活动已结束' : '活动已取消',
    );
    if (reason !== 'disposed') {
      this.socialMemory.recordCompleted(activity.plan.type, {
        initiatorId: activity.plan.initiatorId,
        outcome: reason,
      });
    }
    this.reservations.release(activity.plan.id);
    this.activeActivity = null;
    this.preparedActivity = null;
    this.data.active = null;
    this.runtimeStatus?.setActivityStatus(null);
    return true;
  }

  setAutonomousEnabled(enabled) {
    this.autonomousEnabled = !!enabled;
  }

  triggerScheduledActivity(type = 'party') {
    if (!this.autonomousEnabled || this.activeActivity) return false;
    const definition = getTownActivityDefinition(type);
    const initiator = this._petById(definition?.initiatorId) || this.organizer;
    const plan = this._createPresetPlan(type, initiator || this.organizer);
    return plan ? this._beginActivity(plan) : false;
  }

  _failActivity(error, token) {
    if (!this._isCurrentToken(token)) return;
    console.warn('[TownSocial] Activity failed:', error.message);
    this.runtimeStatus?.failJob(this.activeActivity?.jobId, error);
    const activity = this.activeActivity;
    if (activity) {
      this.socialMemory.recordCompleted(activity.plan.type, {
        initiatorId: activity.plan.initiatorId,
        outcome: 'failed',
      });
    }
    this._cleanupActivityVisuals();
    if (activity) this.reservations.release(activity.plan.id);
    this.activeActivity = null;
    this.preparedActivity = null;
    this.data.active = null;
    this.runtimeStatus?.setActivityStatus(null);
    this.lastNotice = '刚才的活动被风吹歪了一点。没关系，fangk已经把计划本扶正了！';
  }

  async _getActivityAnimation(pet, description, {
    duration,
    loop,
    emitParticles,
    modelJson,
    token,
  }) {
    const fallbackName = this._fallbackAnimationName(pet, this.activeActivity?.plan.type);
    if (!modelJson) {
      return { key: fallbackName, plan: pet._animPlans?.[fallbackName] || null, duration };
    }
    const cacheKey = `pet-animation:${petId(pet)}:${modelRevision(modelJson)}:${description}:${duration}:${loop}:${emitParticles}`;

    try {
      const cached = await this.activityAssetCache.getOrCreateAnimation(cacheKey, async () => {
        const result = await this.contentPort.generateAnimation({
          modelJson,
          description,
          duration,
          emitParticles,
        });
        return { plan: safePlan(result.plan, loop, duration) };
      });
      if (!this._isCurrentToken(token)) return null;
      const key = `social_${modelRevision({ cacheKey })}`;
      pet.loadAnimation?.(key, cached.plan);
      return { key, plan: cached.plan, duration };
    } catch (error) {
      console.warn(`[TownSocial] ${petName(pet)} animation fallback:`, error.message);
      return { key: fallbackName, plan: pet._animPlans?.[fallbackName] || null, duration };
    }
  }

  _fallbackAnimationName(pet, type) {
    if (FESTIVAL_TYPES.has(type) && pet._animPlans?.dance) return 'dance';
    if (['greeting', 'custom_daily'].includes(type) && pet._animPlans?.jump) return 'jump';
    return pet._animPlans?.idle ? 'idle' : Object.keys(pet._animPlans || {})[0];
  }

  async _preparePetMount(pet, part, placement, token) {
    if (!pet?._originalModelJson) return null;
    try {
      const sourceModel = pet._originalModelJson;
      const cacheKey = `pet-mount:${petId(pet)}:${modelRevision(sourceModel)}:${part}:${placement}`;
      const result = await this.activityAssetCache.getOrCreateModel(cacheKey, () => this.aiActions.mountPart({
        modelJson: sourceModel,
        part,
        placement,
        name: `${petName(pet)}活动装饰`,
        tags: ['church_town', 'social_event', 'temporary_mount'],
      }));
      if (!this._isCurrentToken(token)) return null;
      return { pet, modelJson: result.modelJson, assetId: result.assetId };
    } catch (error) {
      console.warn(`[TownSocial] ${petName(pet)} temporary mount skipped:`, error.message);
      return null;
    }
  }

  _applyPetMount(mount) {
    if (!mount || this.temporaryPetModels.has(mount.pet)) return;
    this.temporaryPetModels.set(mount.pet, {
      modelJson: mount.pet._originalModelJson,
      animations: { ...mount.pet._animPlans },
      generatedAssetId: mount.pet._generatedAssetId || null,
    });
    mount.pet.replaceModelFromJson?.(mount.modelJson);
    mount.pet._generatedAssetId = mount.assetId;
  }

  async _prepareWorldMount(entity, part, placement, token) {
    const modelJson = this.worldObjects.getMetadata(entity).modelJson || entity._originalModelJson;
    if (!modelJson) return null;
    try {
      const cacheKey = `world-mount:${modelRevision(modelJson)}:${part}:${placement}`;
      const result = await this.activityAssetCache.getOrCreateModel(cacheKey, () => this.aiActions.mountPart({
        modelJson,
        part,
        placement,
        name: `${entity.name}节日灯笼`,
        tags: ['church_town', 'new_year', 'temporary_mount'],
      }));
      if (!this._isCurrentToken(token)) return null;
      return { entity, modelJson: result.modelJson, assetId: result.assetId };
    } catch (error) {
      console.warn(`[TownSocial] ${entity.name} lantern mount skipped:`, error.message);
      return null;
    }
  }

  _applyWorldMount(mount) {
    if (!mount || this.temporaryWorldModels.has(mount.entity)) return;
    const metadata = this.worldObjects.getMetadata(mount.entity);
    this.temporaryWorldModels.set(mount.entity, {
      modelJson: metadata.modelJson || mount.entity._originalModelJson,
      scale: mount.entity._content.scale.clone(),
      metadata,
    });
    const model = buildModelFromJson(mount.modelJson);
    mount.entity.replaceModel(model, mount.modelJson);
    this.worldObjects.updateMetadata(mount.entity, {
      modelJson: mount.modelJson,
      operation: 'mount',
      assetId: mount.assetId,
    });
    this.objectPlacement?.reconcileModel(mount.entity);
  }

  async _spawnEventProp(spec, plan, index, token) {
    const cacheKey = `event-prop:voxel:${spec.name}:${spec.prompt}`;
    const result = await this.activityAssetCache.getOrCreateModel(cacheKey, () => this.aiActions.createObject({
      description: spec.prompt,
      name: spec.name,
      quality: 'voxel',
      tags: ['church_town', 'social_event', plan.type],
    }));
    if (!this._isCurrentToken(token)) return null;

    return this._createEventPropEntity(spec, plan, index, result);
  }

  _createEventPropEntity(spec, plan, index, result) {
    const desired = this.center.clone().add(new THREE.Vector3(
      plan.type === 'birthday' ? 8 : -7 + index * 4,
      0,
      plan.type === 'apple_pick' ? 7 : 4 + index * 3,
    ));
    if (plan.type === 'apple_pick') {
      const tree = this._targetObject(plan.targetObjectIds[0]);
      if (tree) desired.copy(tree.mesh.position).add(new THREE.Vector3(3.2, 0, 0));
    }

    const entity = new StaticEntity({
      id: `social_${spec.id}_${Date.now().toString(36)}`,
      name: spec.name,
      tags: ['城镇', '活动道具', plan.type],
      category: 'decor',
      position: [desired.x, 0, desired.z],
      scale: 1,
      modelJson: result.modelJson,
      mergeGeometry: false,
    });
    entity._generatedAssetId = result.assetId;
    entity.mesh.userData.noCollider = true;
    entity.mesh.userData.interactionType = 'social_event_prop';
    const placement = this.objectPlacement?.prepareGeneratedEntity(entity, desired, {
      footprint: spec.footprint,
    }) || {
      editable: false,
      source: 'generated',
      footprint: spec.footprint,
    };
    placement.editable = false;
    placement.source = 'social_event';
    this.scene.add(entity.mesh);
    this.worldObjects.add(entity, {
      modelJson: result.modelJson,
      operation: 'generate',
      assetId: result.assetId,
      placement,
    });
    const prop = { entity, spec, modelJson: result.modelJson, particleSystem: null };
    this.eventProps.push(prop);
    return prop;
  }

  async _preparePropAnimation(prop, description, token) {
    try {
      const cacheKey = `prop-animation:${modelRevision(prop.modelJson)}:${description}:2.8:true`;
      const result = await this.activityAssetCache.getOrCreateAnimation(cacheKey, async () => {
        const generated = await this.contentPort.generateAnimation({
          modelJson: prop.modelJson,
          description,
          duration: 2.8,
          emitParticles: true,
        });
        return { plan: safePlan(generated.plan, true, 2.8) };
      });
      if (!this._isCurrentToken(token)) return;
      prop.animationPlan = result.plan;
    } catch (error) {
      console.warn('[TownSocial] Prop animation skipped:', error.message);
    }
  }

  _focusFor(plan, prepared) {
    if (plan.type === 'birthday') {
      const table = prepared.props.find(prop => prop.spec.id === 'birthday_table');
      if (table) return table.entity.mesh.position.clone();
    }
    if (plan.type === 'apple_pick') {
      const target = this._targetObject(plan.targetObjectIds[0]) || this._appleTrees()[0];
      if (target) return target.mesh.position.clone();
    }
    if (['campfire', 'party'].includes(plan.type)) {
      const campfire = this._campfire();
      if (campfire) return campfire.mesh.position.clone();
    }
    return this.center.clone();
  }

  _slotsFor(plan, focus, prepared) {
    const count = plan.participants.length;
    if (plan.type === 'apple_pick') {
      const tree = this._targetObject(plan.targetObjectIds[0]) || this._appleTrees()[0];
      if (tree) {
        const direction = this.center.clone().sub(tree.mesh.position).setY(0).normalize();
        const box = tree.getWorldBBox?.();
        const size = box?.getSize(new THREE.Vector3()) || new THREE.Vector3(3, 3, 3);
        return [tree.mesh.position.clone().addScaledVector(direction, Math.max(size.x, size.z) * 0.5 + 1.3)];
      }
    }
    if (plan.type === 'greeting') {
      return [
        focus.clone().add(new THREE.Vector3(-2.2, 0, 0)),
        focus.clone().add(new THREE.Vector3(2.2, 0, 0)),
      ].slice(0, count);
    }
    if (plan.type === 'birthday') {
      const slots = ringSlots(focus, count, 5.8);
      const table = prepared.props.find(prop => prop.spec.id === 'birthday_table');
      const organizerIndex = plan.participants.indexOf('fangk');
      if (table && organizerIndex >= 0) {
        slots[organizerIndex] = table.entity.mesh.position.clone().add(new THREE.Vector3(0, 0, 7.8));
      }
      return slots;
    }
    const radius = ['campfire', 'party'].includes(plan.type) ? 7.2 : 6;
    return ringSlots(focus, count, radius);
  }

  _cleanupActivityVisuals() {
    this.vfxService?.stop('town-social-celebration');
    this._disposeParticles();
    this.cues.hideAll();
    for (const prop of this.eventProps) {
      this.worldObjects.remove(prop.entity);
      this.scene.remove(prop.entity.mesh);
    }
    this.eventProps = [];

    for (const [pet, snapshot] of this.temporaryPetModels) {
      pet.replaceModelFromJson?.(snapshot.modelJson);
      pet._animPlans = { ...snapshot.animations };
      pet._generatedAssetId = snapshot.generatedAssetId;
      pet.playAnimation?.('idle');
    }
    this.temporaryPetModels.clear();

    for (const [entity, snapshot] of this.temporaryWorldModels) {
      const model = buildModelFromJson(snapshot.modelJson);
      entity.replaceModel(model, snapshot.modelJson);
      entity._content.scale.copy(snapshot.scale);
      this.worldObjects.updateMetadata(entity, {
        ...snapshot.metadata,
        modelJson: snapshot.modelJson,
      });
      this.objectPlacement?.reconcileModel(entity);
    }
    this.temporaryWorldModels.clear();
  }

  _disposeParticles() {
    for (const binding of this.particleBindings) binding.system.dispose();
    this.particleBindings = [];
  }

  _addParticles(plan, root) {
    const system = new ParticleSystem(this.scene);
    system.setup(plan, root);
    this.particleBindings.push({ system, root });
  }

  _resumeOrganizerPerformance() {
    const prepared = this.preparedActivity;
    if (!this.activeActivity) return;
    if (this.activeActivity.status === 'preparing') {
      this.organizer.unlockFacing?.();
      if (getPetStateMachine(this.organizer).is(PET_STATES.FREE_ROAM)) {
        this.petManager.resumePet(this.organizer);
      }
      return;
    }
    if (!prepared) return;
    const animation = this.activeActivity.status === 'birthday_intro'
      ? prepared.introAnimations.get(petId(this.organizer))
      : prepared.animations.get(petId(this.organizer));
    this.organizer.unlockFacing?.();
    this.organizer.lockFacing?.(prepared.focus.x, prepared.focus.z);
    this.organizer.playAnimation?.(animation?.key || this._fallbackAnimationName(this.organizer, prepared.plan.type));
  }

  _validatePlan(plan) {
    return validateActivityPlan(plan, {
      availablePetIds: this.participants.map(petId),
      availableObjectIds: this.worldObjects.items.map(entity => this._objectId(entity)),
    });
  }

  _plannerPets() {
    return this.participants.map(pet => ({ id: petId(pet), profile: pet._profile || {} }));
  }

  _plannerObjects() {
    return [this._campfire(), ...this._appleTrees(), this._church()]
      .filter(Boolean)
      .map(entity => ({ id: this._objectId(entity), name: entity.name, tags: entity.tags || [] }));
  }

  _petById(id) {
    return this.participants.find(pet => petId(pet) === id) || null;
  }

  _objectId(entity) {
    return entity?._instanceId || entity?.id || entity?.mesh?.uuid;
  }

  _targetObject(id) {
    return this.worldObjects.items.find(entity => this._objectId(entity) === id) || null;
  }

  _campfire() {
    return this.worldObjects.query(entity => entity.tags?.includes('篝火'))[0] || null;
  }

  _appleTrees() {
    return this.worldObjects.query(entity => entity.tags?.includes('apple'));
  }

  _church() {
    return this.worldObjects.query(entity => entity.tags?.includes('church'))[0] || null;
  }

  _isCurrentToken(token) {
    return this.activeActivity?.token === token && this.generationToken === token;
  }

  dispose() {
    this.vfxService?.stop('town-social-celebration');
    this.stopActivity('disposed');
    this._disposeParticles();
    this.cues.dispose();
    this.scene.remove(this.socialEmitter);
  }
}
