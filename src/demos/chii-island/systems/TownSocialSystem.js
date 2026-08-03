import * as THREE from 'three';
import { ParticleSystem } from '../../../engine/animation/particles.js';
import { buildModelFromJson } from '../../../engine/model/builder.js';
import { StaticEntity } from '../../../engine/entity/StaticEntity.js';
import { AIWorldActionService } from '../../../gameplay/ai/AIWorldActionService.js';
import { ActivityAssetRepository } from '../../../assets/repositories/ActivityAssetRepository.js';
import { ActivityAssetResolver } from '../../../gameplay/social/ActivityAssetResolver.js';
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
import { getCharacterOutfits } from '../data/equipmentCatalog.js';

const FESTIVAL_TYPES = new Set(['party', 'birthday', 'new_year', 'custom_festival']);
const DANCE_ACTIVITY_TYPES = new Set(['campfire', ...FESTIVAL_TYPES]);
const MIN_ACTIVITY_PERFORMANCE_DURATION = 10;

const ACTIVITY_PHASES = Object.freeze({
  preparing: { index: 1, label: '准备' },
  gathering: { index: 2, label: '集合' },
  costume_change: { index: 2, label: '变装' },
  new_year_greetings: { index: 3, label: '拜年' },
  new_year_dance_gathering: { index: 4, label: '围火' },
  new_year_dancing: { index: 5, label: '跳舞' },
  new_year_feast_setup: { index: 6, label: '开饭' },
  new_year_feast_gathering: { index: 6, label: '入席' },
  new_year_feast: { index: 7, label: '团圆饭' },
  performing: { index: 3, label: '活动' },
  linger: { index: 4, label: '一起玩' },
  prop_exit: { index: 8, label: '收尾' },
  wind_down: { index: 4, label: '收尾' },
});

const NEW_YEAR_GREETING_LINES = Object.freeze({
  fangk: Object.freeze({ pet: '新年好！计划本祝你今年每一页都顺顺利利。', player: '新年好！也祝你的计划少一点加班。' }),
  lingq: Object.freeze({ pet: '新年好！祝你每天都能找到最好看的那一面。', player: '新年好！你的尾羽已经赢在第一天了。' }),
  mako: Object.freeze({ pet: '新年好。祝你想去的地方，都能稳稳跑到。', player: '新年好！今天先跑向年夜饭吧。' }),
  crab: Object.freeze({ pet: '新年好！祝你今年盖什么都不歪，除了想歪的点子。', player: '新年好！钳子也要记得放个假。' }),
});

const ACTIVITY_INVITE_LINES = Object.freeze({
  fangk: '收到，我把计划本和自己一起带过去。',
  lingq: '好呀，我先找一个最上镜的位置。',
  mako: '没问题。我会准时到，顺便多跑两步。',
  crab: '收到！我带钳子，但保证今天不乱施工。',
});

const ACTIVITY_ACTION_LINES = Object.freeze({
  campfire: Object.freeze({
    fangk: '很好，篝火负责暖和，我们负责别坐得太整齐。',
    lingq: '这个火光很懂我的尾羽。',
    mako: '蹄子暖了，再跑一圈也不迟。',
  }),
  apple_pick: Object.freeze({ mako: '就是这颗。它晃得像在主动报名。' }),
  greeting: Object.freeze({
    lingq: '看好啦，这个招呼连尾羽角度都算过。',
    mako: '收到。我会站稳一点，免得抢了镜头。',
  }),
  party: Object.freeze({
    fangk: '很好，今天仍然没有谁跳进篝火。',
    lingq: '这边的观众请看尾羽！',
    mako: '这个节拍很适合踏步。',
  }),
  birthday: Object.freeze({
    fangk: '惊喜正在按计划靠近，寿星先别回头。',
    mako: '原来你们刚才认真地偷偷摸摸，是为了这个。',
    lingq: '礼帽很合适，我的审美也签字了。',
  }),
  new_year: Object.freeze({
    fangk: '新年流程第一条：开心；第二条：别漏掉吃饭。',
    lingq: '红色很衬尾羽，也很衬今天的好心情。',
    mako: '我会慢慢吃。至少第一盘会。',
    crab: '钳子今天只夹菜，不夹施工单。',
  }),
});

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
    equipmentService = null,
    sceneStyle = 'original',
    presentationDirector = null,
    activityRegistry = null,
    activityAssetResolver = null,
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
    this.equipmentService = equipmentService;
    this.sceneStyle = sceneStyle;
    this.presentation = presentationDirector;
    this.organizer = this.participants.find(pet => petId(pet) === 'fangk') || this.participants[0];

    this.reservations = new ActivityReservationService();
    this.coordinator = new SocialEventCoordinator({ petManager });
    this.aiActions = new AIWorldActionService({ contentPort, assetRepository: generatedAssetRepository });
    this.activityAssetCache = activityAssetCache || new TownActivityAssetCache({
      assetRepository: generatedAssetRepository,
    });
    this.activityRegistry = activityRegistry;
    this.activityAssetResolver = activityAssetResolver || (activityRegistry ? new ActivityAssetResolver({
      repository: new ActivityAssetRepository({ generatedAssetRepository }),
      cache: this.activityAssetCache,
      sceneStyle,
    }) : null);
    this.planner = new SocialActivityPlanner({
      contentPort,
      assetLibrary: this.activityAssetCache,
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
    if (this.activeActivity) {
      if (this.activeActivity.status === 'prop_exit') return false;
      if (this._isCurrentInvitationPet(pet)) return true;
      if (
        this.activeActivity.plan.type === 'new_year'
        && this.activeActivity.status === 'new_year_greetings'
      ) {
        return !this.activeActivity.greetedPetIds?.has(petId(pet));
      }
      return petId(pet) === this.activeActivity.plan.exitPetId;
    }
    const state = getPetStateMachine(pet);
    return state.is(PET_STATES.FREE_ROAM) || state.is(PET_STATES.FOLLOWING);
  }

  getInteractionLabel(pet) {
    if (this._isCurrentInvitationPet(pet)) return `邀请${petName(pet)}参加活动`;
    if (
      this.activeActivity?.plan.type === 'new_year'
      && this.activeActivity.status === 'new_year_greetings'
      && !this.activeActivity.greetedPetIds?.has(petId(pet))
    ) {
      return `和${petName(pet)}拜年`;
    }
    if (this.activeActivity && petId(pet) === this.activeActivity.plan.exitPetId) {
      return `和${petName(pet)}商量活动收尾`;
    }
    const opportunity = this.socialDirector.getOpportunity(pet);
    return opportunity
      ? `听听${petName(pet)}的主意`
      : `与${petName(pet)}聊聊`;
  }

  async interact(pet, dialogueSystem) {
    if (!this.canInteract(pet)) return false;
    if (this.activeActivity) return this._interactActive(pet, dialogueSystem);
    return this._interactIdle(pet, dialogueSystem);
  }

  isHandlingActivePet(pet) {
    return !!this.activeActivity && this.canInteract(pet);
  }

  async _interactIdle(pet, dialogueSystem) {
    this.presentation?.focusInteractive(pet);
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
      await dialogueSystem.say({ speakerName: petName(pet), text: startLine });

      this._restorePetDialogue(dialogueSnapshot);
      restored = true;
      return this._beginActivity(plan);
    } finally {
      if (!restored) this._restorePetDialogue(dialogueSnapshot);
    }
  }

  async _interactActive(pet, dialogueSystem) {
    this.presentation?.focusInteractive(pet);
    if (this._isCurrentInvitationPet(pet)) {
      return this._interactActivityInvitation(pet, dialogueSystem);
    }
    if (
      this.activeActivity?.plan.type === 'new_year'
      && this.activeActivity.status === 'new_year_greetings'
    ) {
      return this._interactNewYearGreeting(pet, dialogueSystem);
    }

    const exitPet = this._petById(this.activeActivity.plan.exitPetId) || pet;
    const dialogueSnapshot = this._beginPetDialogue(exitPet);
    let restored = false;
    const restoreDialogue = () => {
      if (restored) return;
      this._restorePetDialogue(dialogueSnapshot);
      restored = true;
    };

    try {
      const activity = this.activeActivity;
      const text = activity.status === 'preparing'
        ? '大家还在准备。想继续等一会儿，还是今天先到这里？'
        : '我们还可以再玩一会儿。要继续，还是准备收尾？';
      const choice = await dialogueSystem.askChoice({
        speakerName: petName(exitPet),
        text,
        options: [
          { key: 'continue', label: '再玩一会儿！' },
          { key: 'end', label: '今天先到这里吧！' },
        ],
      });

      if (choice?.key !== 'end') {
        await dialogueSystem.say({
          speakerName: petName(exitPet),
          text: this._continueLineFor(activity.plan.type, exitPet),
        });
        restoreDialogue();
        this._resumeActivityPet(exitPet);
        return false;
      }

      await dialogueSystem.say({
        speakerName: petName(exitPet),
        text: activity.plan.dialogue?.end || TOWN_SOCIAL_DIALOGUE.fangk.end,
      });
      restoreDialogue();
      this._beginPropExit('host-ended');
      return true;
    } finally {
      restoreDialogue();
    }
  }

  async _interactNewYearGreeting(pet, dialogueSystem) {
    const activity = this.activeActivity;
    if (!activity || activity.greetedPetIds?.has(petId(pet))) return false;
    const snapshot = this._beginPetDialogue(pet);
    this.presentation?.focusInteractive(pet);
    try {
      const line = NEW_YEAR_GREETING_LINES[petId(pet)] || {
        pet: '新年好！祝你今年遇见的每件小事都刚刚好。',
        player: '新年好！也祝你每天都有新点子。',
      };
      await dialogueSystem.say({ speakerName: petName(pet), text: line.pet });
      await dialogueSystem.say({ speakerName: '你', text: line.player });
      activity.greetedPetIds.add(petId(pet));
      pet.playAnimation?.(pet._animPlans?.jump ? 'jump' : 'idle');
      this.vfxService?.playPreset('idea', {
        target: pet.mesh,
        key: `new-year-greeting:${petId(pet)}`,
        duration: 1.4,
      });
      this._setActivityPresentation(`拜年 ${activity.greetedPetIds.size}/${activity.plan.participants.length}`);
      if (activity.greetedPetIds.size >= activity.plan.participants.length) {
        activity.pendingGreetingCompletion = true;
      }
      return true;
    } finally {
      const machine = getPetStateMachine(pet);
      if (machine.is(PET_STATES.INTERACTING)) machine.transition(PET_STATES.PERFORMING, {
        reason: 'new-year-greeting-ended',
      });
      pet.stopWalking?.();
    }
  }

  async _interactActivityInvitation(pet, dialogueSystem) {
    const activity = this.activeActivity;
    if (!activity || !this._isCurrentInvitationPet(pet)) return false;
    const snapshot = this._beginPetDialogue(pet);
    this.presentation?.focusInteractive(pet);
    try {
      await dialogueSystem.say({
        speakerName: petName(pet),
        text: ACTIVITY_INVITE_LINES[petId(pet)] || '好呀，我收拾一下就过去！',
      });
      this._completePreparationTaskStep(activity);
      return true;
    } finally {
      this._restorePetDialogue(snapshot);
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

  _continueLineFor(type, pet) {
    if (type === 'apple_pick') return '好，再看看下一颗。它们今天都挺积极。';
    if (type === 'greeting') return '好，我再练一次。这次争取看起来像没练过。';
    if (type === 'campfire') return '那就再暖一会儿，篝火还没有下班。';
    return petId(pet) === 'fangk' ? TOWN_SOCIAL_DIALOGUE.fangk.continue : '好呀，那就再玩一会儿！';
  }

  _showActivityDialogue(pet, text, options = {}) {
    if (!pet || !text) return false;
    if (this.presentation) return this.presentation.showDialogue(pet, text, options);
    this.cues.showLine(pet, text, (options.duration || 2800) / 1000);
    return true;
  }

  _showActivityFullBody(pet, text, options = {}) {
    if (this.presentation) return this.presentation.showFullBody(pet, text, options);
    return this._showActivityDialogue(pet, text, options);
  }

  _showActivityGroup(pets, speaker, text, options = {}) {
    if (this.presentation) return this.presentation.showGroup(pets, speaker, text, options);
    return this._showActivityDialogue(speaker, text, options);
  }

  _showActivityProp(prop, speaker, text, options = {}) {
    if (this.presentation) return this.presentation.showProp(prop, speaker, text, options);
    return this._showActivityDialogue(speaker, text, options);
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
    const targetObjectIds = this.socialDirector
      .targetsFor(definition, initiator)
      .map(entity => this._objectId(entity));

    const raw = createPresetTownActivity(type, {
      initiatorId: petId(initiator) || definition.initiatorId,
      participantIds: participants.map(petId),
      subjectId: definition.subjectId || null,
      targetObjectIds,
    });
    const plan = this._validatePlan(raw);
    const registration = this.activityRegistry?.findReadyByType(type);
    if (registration) {
      plan.registryId = registration.id;
      plan.registryRevision = registration.revision;
    }
    return plan;
  }

  async _requestCustomDailyPlan(pet, dialogueSystem) {
    const concept = await dialogueSystem.askInput({
      speakerName: petName(pet),
      text: '说说看！你想让我们做什么小活动？',
      placeholder: '例如：和mako一起转圈玩',
    });
    if (!concept) return null;
    const registered = this.activityRegistry?.findReadyByConcept('custom_daily', concept);
    if (registered?.plan) {
      const confirmation = await dialogueSystem.askChoice({
        speakerName: petName(pet),
        text: `这个活动我们办过，叫“${registered.title}”。照上次的安排直接开始吗？`,
        options: [
          { key: 'confirm', label: '就按熟悉的来！' },
          { key: 'cancel', label: '今天先不办' },
        ],
      });
      if (confirmation?.key !== 'confirm') return null;
      return {
        ...registered.plan,
        id: `custom_daily_${Date.now().toString(36)}`,
        registryId: registered.id,
        registryRevision: registered.revision,
      };
    }
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
    const registered = this.activityRegistry?.findReadyByConcept('custom_festival', concept);
    if (registered?.plan) {
      const confirmation = await dialogueSystem.askChoice({
        speakerName: petName(this.organizer),
        text: `这个节日计划本里有，叫“${registered.title}”。直接照成熟流程开场吗？`,
        options: [
          { key: 'confirm', label: '照计划开场！' },
          { key: 'cancel', label: '先把本子合上' },
        ],
      });
      if (confirmation?.key !== 'confirm') return null;
      return {
        ...registered.plan,
        id: `custom_festival_${Date.now().toString(36)}`,
        registryId: registered.id,
        registryRevision: registered.revision,
      };
    }
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

    let registration = plan.registryId ? this.activityRegistry?.get(plan.registryId) : null;
    if (!registration && this.activityRegistry) {
      const resolution = this.activityRegistry.resolve(plan);
      if (resolution.match === 'exact') registration = resolution.record;
      else {
        try {
          registration = this.activityRegistry.createDraft(plan, {
            similar: resolution.match === 'similar' ? resolution.record : null,
          });
        } catch (error) {
          console.warn('[TownSocial] Activity draft registration skipped:', error.message);
        }
      }
    }
    if (registration) {
      plan.registryId = registration.id;
      plan.registryRevision = registration.revision;
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
      prepTask: this._createPreparationTask(plan),
      registration,
    };
    this.socialMemory.recordStarted(plan.type, plan.initiatorId);
    this.data.active = { id: plan.id, type: plan.type, status: 'preparing' };
    this._setActivityPresentation('准备活动素材，顺手帮个小忙吧');

    this._prepareActivity(plan, token)
      .then(prepared => {
        if (!this._isCurrentToken(token)) return;
        this.preparedActivity = prepared;
        this._tryStartPreparedActivity();
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
      petOutfits: [],
      worldMounts: [],
      animations: new Map(),
      costumeAnimations: new Map(),
      feastAnimations: new Map(),
      introAnimations: new Map(),
      maxActionDuration: MIN_ACTIVITY_PERFORMANCE_DURATION,
      registration: this.activeActivity?.registration || null,
    };

    if (plan.type === 'birthday') {
      const subject = this._petById(plan.subjectId || 'mako');
      const outfit = await this._preparePetOutfit(subject, 'birthday', token);
      if (outfit) prepared.petOutfits.push(outfit);
    }
    if (plan.type === 'new_year') {
      const clothing = await Promise.allSettled(
        plan.participants.map(id => {
          const pet = this._petById(id);
          return this._preparePetOutfit(pet, 'new-year', token);
        }),
      );
      prepared.petOutfits.push(...clothing.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []));

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
    const modelOverrides = new Map([
      ...prepared.petMounts.map(mount => [petId(mount.pet), mount.modelJson]),
      ...prepared.petOutfits.map(outfit => [petId(outfit.pet), outfit.modelJson]),
    ]);
    const animationResults = await Promise.all(plan.participants.map(async id => {
      const pet = this._petById(id);
      if (!pet) return null;
      const loop = true;
      const duration = 4;
      const registered = await this._getRegisteredActivityAnimation(pet, 'main', duration, modelOverrides.get(id) || pet._originalModelJson);
      const reusable = registered || this._getReusableActivityAnimation(pet, plan.type, duration);
      const animation = reusable || await this._getActivityAnimation(pet, plan.actionPrompts[id], {
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

    const costumeAnimations = await Promise.all(prepared.petOutfits.map(async outfit => {
      const animation = await this._getRegisteredActivityAnimation(outfit.pet, 'costume', 2.2, outfit.pet._originalModelJson)
        || await this._getActivityAnimation(outfit.pet, '原地转身展示新衣', {
        duration: 2.2,
        loop: false,
        emitParticles: false,
        modelJson: outfit.pet._originalModelJson,
        token,
      });
      return animation ? [petId(outfit.pet), animation] : null;
    }));
    for (const result of costumeAnimations.filter(Boolean)) {
      prepared.costumeAnimations.set(result[0], result[1]);
    }

    if (plan.type === 'new_year') {
      const feastAnimations = await Promise.all(plan.participants.map(async id => {
        const pet = this._petById(id);
        if (!pet) return null;
        const animation = await this._getRegisteredActivityAnimation(pet, 'feast', 3, modelOverrides.get(id) || pet._originalModelJson)
          || await this._getActivityAnimation(pet, '低头拿起食物品尝', {
          duration: 3,
          loop: true,
          emitParticles: false,
          modelJson: modelOverrides.get(id) || pet._originalModelJson,
          token,
        });
        return animation ? [id, animation] : null;
      }));
      for (const result of feastAnimations.filter(Boolean)) prepared.feastAnimations.set(result[0], result[1]);
    }

    if (plan.type === 'birthday' && this.organizer) {
      const push = await this._getRegisteredActivityAnimation(this.organizer, 'intro', 2.8, this.organizer._originalModelJson)
        || await this._getActivityAnimation(this.organizer, '双手向前推蛋糕桌', {
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
    if (activity.status === 'gathering') return;
    this.preparedActivity = prepared;
    activity.status = 'gathering';
    activity.elapsed = 0;
    this.data.active.status = 'gathering';
    this._setActivityPresentation('小伙伴们正在前往活动地点');

    for (const mount of prepared.worldMounts) this._applyWorldMount(mount);
    this.runtimeStatus?.completeJob(activity.jobId, prepared.plan.dialogue.ready);

    const participants = prepared.plan.participants.map(id => this._petById(id)).filter(Boolean);
    this.coordinator.start({
      plan: prepared.plan,
      participants,
      slots: prepared.slots,
      onPerform: () => this._performPreparedActivity(prepared),
      onFinish: () => this._cleanupActivityVisuals(),
      onBlocked: () => {
        this.lastNotice = '路有点远，大家先回广场歇口气。下次挑一棵走得到的苹果树！';
        this.stopActivity('gather-timeout');
      },
    });
  }

  _performPreparedActivity(prepared) {
    const activity = this.activeActivity;
    if (!activity) return;
    activity.status = prepared.petOutfits.length > 0
      ? 'costume_change'
      : (prepared.plan.type === 'birthday' ? 'birthday_intro' : 'performing');
    activity.elapsed = 0;
    this.data.active.status = activity.status;
    this._setActivityPresentation('节目开场啦，看看大家准备了什么');

    if (prepared.petOutfits.length > 0) {
      this._startCostumeChange(prepared);
      return;
    }
    if (prepared.plan.type === 'birthday') {
      this._startBirthdayIntro(prepared);
      return;
    }
    if (prepared.plan.type === 'new_year') {
      this._startNewYearGreetings(prepared);
      return;
    }
    this._beginMainPerformance(prepared);
  }

  _startCostumeChange(prepared) {
    const activity = this.activeActivity;
    if (!activity) return;
    activity.status = 'costume_change';
    activity.elapsed = 0;
    activity.costumesApplied = false;
    this.data.active.status = 'costume_change';
    this._setActivityPresentation('大家转个圈，春节和生日衣服马上登场');
    for (const outfit of prepared.petOutfits) {
      const animation = prepared.costumeAnimations.get(petId(outfit.pet));
      outfit.pet.stopWalking?.();
      outfit.pet.playAnimation?.(animation?.key || (outfit.pet._animPlans?.jump ? 'jump' : 'idle'));
      this.vfxService?.playPreset(this._registeredVfxPreset(), {
        target: outfit.pet.mesh,
        key: `town-costume:${petId(outfit.pet)}`,
        duration: 2.2,
      });
      const line = prepared.plan.type === 'birthday' && petId(outfit.pet) === prepared.plan.subjectId
        ? '咦，帽子怎么自己跑到我头上了？'
        : `${petName(outfit.pet)}转个圈，新衣服就站稳啦。`;
      this._showActivityFullBody(outfit.pet, line, { duration: 2500 });
    }
  }

  _finishCostumeChange(prepared) {
    if (prepared.plan.type === 'birthday') {
      this._startBirthdayIntro(prepared);
      return;
    }
    if (prepared.plan.type === 'new_year') {
      this._startNewYearGreetings(prepared);
      return;
    }
    this._beginMainPerformance(prepared);
  }

  _startBirthdayIntro(prepared) {
    const activity = this.activeActivity;
    if (!activity) return;
    activity.status = 'birthday_intro';
    activity.elapsed = 0;
    this.data.active.status = 'birthday_intro';
    this._setActivityPresentation('fangk 正把蛋糕桌推到寿星面前');
    this._showActivityFullBody(this.organizer, '蛋糕正在进场，蜡烛比寿星先知道路线。', {
      duration: 2600,
    });
    const table = prepared.props.find(prop => prop.spec.id === 'birthday_table');
    const organizerAnimation = prepared.introAnimations.get(petId(this.organizer));
    if (organizerAnimation) this.organizer.playAnimation?.(organizerAnimation.key);
    if (!table) {
      this._finishBirthdayIntro(prepared);
      return;
    }

    this._revealEventProp(table);
    this._showActivityProp(table.entity, this.organizer, '生日蛋糕安全到位，蜡烛也没有迷路。');

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

  _startNewYearGreetings(prepared) {
    const activity = this.activeActivity;
    if (!activity) return;
    activity.status = 'new_year_greetings';
    activity.elapsed = 0;
    activity.greetedPetIds = new Set();
    activity.pendingGreetingCompletion = false;
    activity.stageTask = {
      label: `和城镇伙伴拜年 0/${activity.plan.participants.length}`,
      complete: false,
    };
    this.data.active.status = activity.status;
    this._showActivityDialogue(this.organizer, '第一项：挨个说新年好。别漏掉我，我也很想听！');
    this._setActivityPresentation('走近每位伙伴，按 E 送上新年祝福');
  }

  _startNewYearDanceGathering(prepared) {
    const activity = this.activeActivity;
    if (!activity) return;
    const campfire = this._campfire();
    const focus = campfire?.mesh?.position?.clone() || this.center.clone();
    activity.status = 'new_year_dance_gathering';
    activity.elapsed = 0;
    activity.stageTask = {
      label: '跟着大家去篝火旁集合',
      target: focus.clone(),
      radius: 8.5,
      complete: false,
    };
    activity.stageSlots = this._resolveReachableSlots(
      prepared.plan,
      ringSlots(focus, prepared.plan.participants.length, 8.2),
      focus,
    );
    this.data.active.status = activity.status;
    this._revealPropsForStage('dance');
    this._moveParticipantsTo(activity.stageSlots);
    this._showActivityDialogue(this.organizer, '祝福收齐！下一项，围着篝火把冷空气跳跑。');
    this._setActivityPresentation('大家正往篝火旁集合');
  }

  _startNewYearDance(prepared) {
    const activity = this.activeActivity;
    if (!activity) return;
    const focus = this._campfire()?.mesh?.position || this.center;
    activity.status = 'new_year_dancing';
    activity.elapsed = 0;
    activity.stageTask.complete = this._playerNear(activity.stageTask);
    this.data.active.status = activity.status;
    for (const id of prepared.plan.participants) {
      const pet = this._petById(id);
      const animation = prepared.animations.get(id);
      if (!pet) continue;
      pet.stopWalking?.();
      pet.lockFacing?.(focus.x, focus.z);
      pet.playAnimation?.(animation?.key || this._fallbackAnimationName(pet, 'new_year'));
    }
    this.socialEmitter.position.copy(focus);
    this.vfxService?.playPreset(this._registeredVfxPreset(), {
      target: this.socialEmitter,
      key: 'town-social-celebration',
      duration: 10,
    });
    for (const prop of prepared.props.filter(entry => entry.spec.revealStage === 'dance')) {
      if (!prop.animationPlan) continue;
      prop.entity.playIdleAnimation(prop.animationPlan, prop.animationPlan._duration || 2.8);
      if (prop.entity._modelGroup) this._addParticles(prop.animationPlan, prop.entity._modelGroup);
    }
    this._setActivityPresentation('围着篝火一起跳舞');
    this._showActivityGroup(
      prepared.plan.participants.map(id => this._petById(id)).filter(Boolean),
      this.organizer,
      '围好啦！现在把冷空气一起跳跑。',
      { duration: 3400 },
    );
  }

  _startNewYearFeastSetup(prepared) {
    const activity = this.activeActivity;
    if (!activity) return;
    activity.status = 'new_year_feast_setup';
    activity.elapsed = 0;
    activity.tablesRevealed = false;
    activity.foodRevealed = false;
    activity.stageTask = {
      label: '去年夜饭桌旁帮 fangk 看看位置',
      target: this._newYearFeastCenter(prepared),
      radius: 7,
      complete: false,
    };
    this.data.active.status = activity.status;
    this.organizer.playAnimation?.(this.organizer._animPlans?.construct ? 'construct' : 'idle');
    this._showActivityFullBody(this.organizer, '舞跳完了，肚子正式获得发言权。看我摆桌！');
    this._setActivityPresentation('fangk 正在把团圆饭端上广场');
  }

  _startNewYearFeastGathering(prepared) {
    const activity = this.activeActivity;
    if (!activity) return;
    const focus = this._newYearFeastCenter(prepared);
    activity.status = 'new_year_feast_gathering';
    activity.elapsed = 0;
    activity.stageSlots = this._resolveReachableSlots(
      prepared.plan,
      ringSlots(focus, prepared.plan.participants.length, 5.4, Math.PI / 2),
      focus,
    );
    activity.stageTask.complete = this._playerNear(activity.stageTask);
    this.data.active.status = activity.status;
    this._moveParticipantsTo(activity.stageSlots);
    this._setActivityPresentation('饭菜到齐，大家正在找自己的座位');
  }

  _startNewYearFeast(prepared) {
    const activity = this.activeActivity;
    if (!activity) return;
    const focus = this._newYearFeastCenter(prepared);
    activity.status = 'new_year_feast';
    activity.elapsed = 0;
    activity.stageTask = { label: '和大家吃团圆饭；想结束时去找 fangk', complete: true };
    this.data.active.status = activity.status;
    for (const id of prepared.plan.participants) {
      const pet = this._petById(id);
      const animation = prepared.feastAnimations.get(id);
      if (!pet) continue;
      pet.stopWalking?.();
      pet.lockFacing?.(focus.x, focus.z);
      pet.playAnimation?.(animation?.key || 'idle');
    }
    this._showActivityGroup(
      prepared.plan.participants.map(id => this._petById(id)).filter(Boolean),
      this.organizer,
      '开饭！今天谁数饺子，谁就负责数到忘记。',
    );
    this._setActivityPresentation('团圆饭开始，找 fangk 可以结束春节活动');
  }

  _moveParticipantsTo(slots) {
    const participants = this.preparedActivity?.plan.participants || [];
    participants.forEach((id, index) => {
      const pet = this._petById(id);
      const slot = slots[index];
      if (!pet || !slot) return;
      pet.unlockFacing?.();
      pet.stopWalking?.();
      pet.walkTo?.(slot.x, slot.z, 4.2);
    });
  }

  _participantsArrived(slots, tolerance = 0.75) {
    return (this.preparedActivity?.plan.participants || []).every((id, index) => {
      const position = this._petById(id)?.mesh?.position;
      const slot = slots[index];
      return position && slot && Math.hypot(position.x - slot.x, position.z - slot.z) <= tolerance;
    });
  }

  _playerNear(task) {
    if (!task?.target || !this.player?.mesh?.position) return false;
    const dx = this.player.mesh.position.x - task.target.x;
    const dz = this.player.mesh.position.z - task.target.z;
    return (dx * dx) + (dz * dz) <= (task.radius || 5) ** 2;
  }

  _newYearFeastCenter(prepared) {
    const tables = prepared.props.filter(prop => prop.spec.revealStage === 'table');
    if (tables.length === 0) return this.center.clone().add(new THREE.Vector3(0, 0, 9));
    return tables.reduce(
      (sum, prop) => sum.add(prop.entity.mesh.position),
      new THREE.Vector3(),
    ).multiplyScalar(1 / tables.length);
  }

  _beginMainPerformance(prepared) {
    const activity = this.activeActivity;
    if (!activity) return;
    activity.status = 'performing';
    activity.elapsed = 0;
    this.data.active.status = 'performing';
    this._setActivityPresentation('节目开场啦，看看大家准备了什么');
    this._disposeParticles();
    this._revealPropsForStage('performance');

    if (this._hasBeat(prepared.plan, 'opening') || this._hasBeat(prepared.plan, 'perform')) {
      const announcer = this._petById(prepared.plan.initiatorId) || this.organizer;
      const participants = prepared.plan.participants.map(id => this._petById(id)).filter(Boolean);
      this._showActivityGroup(participants, announcer, prepared.plan.dialogue.ready);
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

    for (const id of prepared.plan.participants.slice(0, prepared.plan.scale === 'festival' ? 3 : 2)) {
      const pet = this._petById(id);
      if (!pet) continue;
      const line = ACTIVITY_ACTION_LINES[prepared.plan.type]?.[id]
        || `${petName(pet)}：“这个动作我准备好啦！”`;
      this._showActivityFullBody(pet, line, { duration: 2400 });
    }
    const featuredProp = prepared.props.find(prop => prop.entity.mesh.visible);
    if (featuredProp && prepared.plan.type === 'apple_pick') {
      this._showActivityProp(featuredProp.entity, this._petById('mako'), '苹果到手。它确实是自己报名的。');
    }

    if (FESTIVAL_TYPES.has(prepared.plan.type)) {
      this.socialEmitter.position.copy(prepared.focus);
      this.vfxService?.playPreset(this._registeredVfxPreset(), {
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
    this._updatePropTransitions(dt);
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
    this._updatePreparationTask(activity);
    if (!prepared) return;
    activity.elapsed += dt;

    if (activity.status === 'costume_change') {
      if (!activity.costumesApplied && activity.elapsed >= 1.7) {
        activity.costumesApplied = true;
        for (const outfit of prepared.petOutfits) this._applyPetOutfit(outfit);
      }
      if (activity.elapsed >= 2.2) this._finishCostumeChange(prepared);
      return;
    }

    if (activity.status === 'new_year_greetings') {
      if (activity.stageTask) {
        activity.stageTask.label = `和城镇伙伴拜年 ${activity.greetedPetIds.size}/${activity.plan.participants.length}`;
        activity.stageTask.complete = activity.greetedPetIds.size >= activity.plan.participants.length;
      }
      if (activity.pendingGreetingCompletion) {
        activity.pendingGreetingCompletion = false;
        this._startNewYearDanceGathering(prepared);
      }
      return;
    }

    if (activity.status === 'new_year_dance_gathering') {
      if (activity.stageTask && !activity.stageTask.complete) {
        activity.stageTask.complete = this._playerNear(activity.stageTask);
      }
      if (this._participantsArrived(activity.stageSlots) || activity.elapsed >= 12) {
        this._startNewYearDance(prepared);
      }
      return;
    }

    if (activity.status === 'new_year_dancing') {
      if (activity.stageTask && !activity.stageTask.complete) {
        activity.stageTask.complete = this._playerNear(activity.stageTask);
      }
      if (activity.elapsed >= 10) this._startNewYearFeastSetup(prepared);
      return;
    }

    if (activity.status === 'new_year_feast_setup') {
      if (activity.stageTask && !activity.stageTask.complete) {
        activity.stageTask.complete = this._playerNear(activity.stageTask);
      }
      if (!activity.tablesRevealed && activity.elapsed >= 0.7) {
        activity.tablesRevealed = true;
        this._revealPropsForStage('table');
        const table = prepared.props.find(prop => prop.spec.revealStage === 'table');
        if (table) this._showActivityProp(table.entity, this.organizer, '桌子到位。现在轮到年夜饭认真登场。');
      }
      if (!activity.foodRevealed && activity.elapsed >= 2.3) {
        activity.foodRevealed = true;
        this._revealPropsForStage('food');
        const food = prepared.props.find(prop => prop.spec.revealStage === 'food');
        if (food) this._showActivityProp(food.entity, this.organizer, '鱼、饺子、年糕都来了，空盘子开始紧张了。');
      }
      if (activity.elapsed >= 4) this._startNewYearFeastGathering(prepared);
      return;
    }

    if (activity.status === 'new_year_feast_gathering') {
      if (this._participantsArrived(activity.stageSlots) || activity.elapsed >= 12) {
        this._startNewYearFeast(prepared);
      }
      return;
    }

    if (activity.status === 'new_year_feast') {
      this._updateFestivalBarks(activity, prepared);
      return;
    }

    if (activity.status === 'prop_exit') {
      if (activity.elapsed >= 1.2) this.stopActivity(activity.exitReason || 'host-ended');
      return;
    }

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
      this._ensureActivityAnimations(prepared);
      this._updateFestivalBarks(activity, prepared);
      const duration = Math.max(prepared.maxActionDuration, prepared.plan.performanceDuration || 0);
      if (activity.elapsed >= duration) {
        activity.status = 'linger';
        activity.elapsed = 0;
        this.data.active.status = 'linger';
        const reaction = prepared.plan.dialogue.reaction;
        if (reaction && this._hasBeat(prepared.plan, 'reaction')) {
          this._showActivityDialogue(this._petById(reaction.speakerId), reaction.text);
        }
        this._setActivityPresentation(`活动继续中，找${petName(this._petById(prepared.plan.exitPetId))}商量收尾`);
      }
      return;
    }

    if (activity.status === 'linger') {
      this._ensureActivityAnimations(prepared);
      this._updateFestivalBarks(activity, prepared);
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
      this._showActivityDialogue(this._petById(reaction.speakerId), reaction.text);
    } else {
      const initiator = this._petById(prepared.plan.initiatorId) || this.organizer;
      this._showActivityDialogue(initiator, prepared.plan.dialogue.end);
    }
    this._setActivityPresentation('大家挥挥手，慢慢回到自己的日常');
  }

  _createPreparationTask(plan) {
    const steps = [];
    const addInvites = (ids, limit = 2) => {
      for (const id of ids.filter(Boolean).slice(0, limit)) {
        steps.push({ kind: 'talk_pet', petId: id, label: `去邀请${petName(this._petById(id))}参加活动` });
      }
    };
    const visit = (label, target, radius = 6) => steps.push({
      kind: 'visit', label, target: target.clone(), radius,
    });
    const otherParticipants = plan.participants.filter(id => id !== plan.initiatorId);
    const campfire = this._campfire()?.mesh?.position || this.center;
    const tree = (this._targetObject(plan.targetObjectIds[0]) || this._appleTrees()[0])?.mesh?.position;

    if (plan.type === 'apple_pick') {
      visit('和mako去苹果树旁看看', tree || this.center, 5.5);
    } else if (plan.type === 'greeting') {
      addInvites(otherParticipants, 1);
      visit('回到广场看看招呼练习的位置', this.center, 5.5);
    } else if (plan.type === 'campfire') {
      addInvites(otherParticipants, 2);
      visit('去篝火旁等大家过来', campfire, 6);
    } else if (plan.type === 'party') {
      addInvites(otherParticipants, 2);
      visit('去篝火旁给派对留个位置', campfire, 6);
    } else if (plan.type === 'birthday') {
      addInvites(otherParticipants.filter(id => id !== plan.subjectId), 2);
      visit('回广场站到惊喜不会穿帮的位置', this.center, 6);
    } else if (plan.type === 'new_year') {
      const church = this._church()?.mesh?.position || this.center;
      steps.push(
        {
          kind: 'visit',
          label: '去教堂门前看看灯笼挂正没有',
          target: church.clone(),
          radius: 7,
        },
        {
          kind: 'visit',
          label: '再去篝火旁留出大家跳舞的位置',
          target: campfire.clone(),
          radius: 7,
        },
        {
          kind: 'visit',
          label: '回广场找找年夜饭桌适合摆在哪里',
          target: this.center.clone().add(new THREE.Vector3(0, 0, 9)),
          radius: 6,
        },
      );
    } else {
      addInvites(otherParticipants, plan.scale === 'festival' ? 2 : 1);
      visit('到活动地点看看位置', plan.locationId === 'campfire' ? campfire : this.center, 6);
    }

    const task = { steps, stepIndex: 0, complete: steps.length === 0, skipped: false };
    if (steps[0]) Object.assign(task, steps[0]);
    return task;
  }

  _updatePreparationTask(activity) {
    const task = activity?.prepTask;
    if (activity?.status !== 'preparing' || !task || task.complete || task.skipped) return;
    if (task.kind !== 'visit') return;
    const playerPosition = this.player?.mesh?.position;
    if (!playerPosition) return;
    const dx = playerPosition.x - task.target.x;
    const dz = playerPosition.z - task.target.z;
    if ((dx * dx) + (dz * dz) > task.radius * task.radius) return;
    this._completePreparationTaskStep(activity);
  }

  _isCurrentInvitationPet(pet) {
    const task = this.activeActivity?.prepTask;
    return this.activeActivity?.status === 'preparing'
      && task?.kind === 'talk_pet'
      && task.petId === petId(pet);
  }

  _completePreparationTaskStep(activity) {
    const task = activity?.prepTask;
    if (!task || task.complete) return;
    if (task.stepIndex < task.steps.length - 1) {
      task.stepIndex += 1;
      Object.assign(task, task.steps[task.stepIndex]);
      this._setActivityPresentation(`准备任务 ${task.stepIndex + 1}/${task.steps.length}`);
      return;
    }
    task.complete = true;
    this._setActivityPresentation('准备任务完成，活动马上开场');
    this._tryStartPreparedActivity();
  }

  _tryStartPreparedActivity() {
    const activity = this.activeActivity;
    const prepared = this.preparedActivity;
    if (!activity || !prepared || activity.plan.id !== prepared.plan.id) return false;
    if (activity.prepTask && !activity.prepTask.complete) {
      this._setActivityPresentation('素材准备好了，等你完成邀请和到场任务');
      return false;
    }
    this._startPreparedActivity(prepared);
    return true;
  }

  _setActivityPresentation(stage) {
    const activity = this.activeActivity;
    if (!activity) return;
    const phaseKey = activity.status === 'birthday_intro' ? 'performing' : activity.status;
    const phase = ACTIVITY_PHASES[phaseKey] || ACTIVITY_PHASES.preparing;
    const taskSource = activity.stageTask
      || (activity.prepTask && !activity.prepTask.skipped ? activity.prepTask : null);
    const task = taskSource
      ? { label: taskSource.label, complete: taskSource.complete }
      : null;
    const exitName = petName(this._petById(activity.plan.exitPetId));
    const helper = activity.plan.type === 'new_year' && activity.status !== 'new_year_feast'
      ? '跟着右上角的小任务走，年夜饭正在后面排队'
      : `想结束活动，就去找 ${exitName} 商量`;
    this.runtimeStatus?.setActivityStatus(activity.plan.title, stage, {
      phase: phaseKey,
      phaseLabel: phase.label,
      phaseIndex: phase.index,
      phaseCount: activity.plan.type === 'new_year' ? 8 : 4,
      task,
      helper,
    });
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
      this._showActivityDialogue(this._petById(line.speakerId), line.text, { duration: 2600 });
    }
    activity.nextAmbientAt += 9;
  }

  _hasBeat(plan, beat) {
    return plan.beats?.includes(beat) ?? false;
  }

  stopActivity(reason = 'host-ended') {
    const activity = this.activeActivity;
    if (!activity) return false;
    const prepared = this.preparedActivity;
    if (activity.registration && this.activityRegistry) {
      try {
        if (['host-ended', 'auto-completed'].includes(reason) && activity.registration.status !== 'ready') {
          activity.registration = this.activityRegistry.markReady(activity.registration.id, {
            plan: activity.plan,
            assets: this._collectActivityRegistrationAssets(prepared, activity.registration.assets),
            provenance: { completedAt: Date.now() },
          });
        }
        this.activityRegistry.recordRun(activity.registration.id, reason);
      } catch (error) {
        console.warn('[TownSocial] Activity registry completion skipped:', error.message);
      }
    }
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
    this.presentation?.clear();
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
      try {
        this.activityRegistry?.recordRun(activity.registration?.id, 'failed');
      } catch (registryError) {
        console.warn('[TownSocial] Activity registry failure record skipped:', registryError.message);
      }
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
    this.presentation?.clear();
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
      }, {
        kind: 'pet_animation',
        activityType: this.activeActivity?.plan.type,
        subjectId: petId(pet),
        name: `${petName(pet)}活动动作`,
        prompt: description,
      });
      if (!this._isCurrentToken(token)) return null;
      const key = `social_${modelRevision({ cacheKey })}`;
      pet.loadAnimation?.(key, cached.plan);
      return {
        key,
        plan: cached.plan,
        duration,
        binding: { kind: 'activity_cache', cacheKey, key, subjectId: petId(pet), sceneStyles: [this.sceneStyle] },
      };
    } catch (error) {
      console.warn(`[TownSocial] ${petName(pet)} animation fallback:`, error.message);
      return { key: fallbackName, plan: pet._animPlans?.[fallbackName] || null, duration };
    }
  }

  async _getRegisteredActivityAnimation(pet, role, duration, modelJson) {
    const registration = this.activeActivity?.registration;
    const binding = registration?.assets?.animations?.[petId(pet)]?.[role];
    if (!binding || !this.activityAssetResolver) return null;
    try {
      const resolved = await this.activityAssetResolver.resolveAnimation(binding, { pet, modelJson });
      if (!resolved?.plan) return null;
      const plan = safePlan(resolved.plan, resolved.plan._loop !== false, Math.max(Number(resolved.plan._duration) || 0, duration));
      const key = resolved.key || `registered_${petId(pet)}_${role}`;
      if (!pet._animPlans?.[key]) pet.loadAnimation?.(key, plan);
      return { key, plan, duration: Math.max(Number(plan._duration) || 0, duration), source: resolved.source, binding };
    } catch (error) {
      console.warn(`[TownSocial] Registered ${petName(pet)} ${role} animation skipped:`, error.message);
      return null;
    }
  }

  _fallbackAnimationName(pet, type) {
    if (DANCE_ACTIVITY_TYPES.has(type)) {
      if (pet._animPlans?.dance) return 'dance';
      if (pet._animPlans?.special) return 'special';
      if (pet._animPlans?.jump) return 'jump';
      if (pet._animPlans?.run) return 'run';
    }
    if (['greeting', 'custom_daily'].includes(type) && pet._animPlans?.jump) return 'jump';
    return pet._animPlans?.idle ? 'idle' : Object.keys(pet._animPlans || {})[0];
  }

  _getReusableActivityAnimation(pet, type, duration) {
    if (!DANCE_ACTIVITY_TYPES.has(type)) return null;
    const plan = pet?._animPlans?.dance;
    if (!plan) return null;
    return {
      key: 'dance',
      plan,
      duration: Math.max(Number(plan._duration) || 0, duration),
      source: 'resident-animation-library',
      binding: { kind: 'resident_animation', name: 'dance', subjectId: petId(pet), sceneStyles: [this.sceneStyle] },
    };
  }

  _collectActivityRegistrationAssets(prepared, existing = {}) {
    if (!prepared) return existing || {};
    const animations = { ...(existing?.animations || {}) };
    for (const [id, animation] of prepared.animations) {
      if (animation?.binding) animations[id] = { ...(animations[id] || {}), main: animation.binding };
    }
    for (const [id, animation] of prepared.costumeAnimations) {
      if (animation?.binding) animations[id] = { ...(animations[id] || {}), costume: animation.binding };
    }
    for (const [id, animation] of prepared.feastAnimations) {
      if (animation?.binding) animations[id] = { ...(animations[id] || {}), feast: animation.binding };
    }
    for (const [id, animation] of prepared.introAnimations) {
      if (animation?.binding) animations[id] = { ...(animations[id] || {}), intro: animation.binding };
    }
    const models = { ...(existing?.models || {}) };
    for (const prop of prepared.props) {
      if (prop.assetBinding) models[prop.spec.id] = prop.assetBinding;
      if (prop.animationBinding) animations[prop.spec.id] = { ...(animations[prop.spec.id] || {}), main: prop.animationBinding };
    }
    const mounts = { ...(existing?.mounts || {}) };
    for (const mount of prepared.worldMounts) {
      if (!mount.assetBinding) continue;
      mounts[mount.entity === this._church() ? 'church' : 'apple_tree'] = mount.assetBinding;
    }
    const outfits = { ...(existing?.outfits || {}) };
    for (const outfit of prepared.petOutfits) {
      outfits[petId(outfit.pet)] = {
        kind: 'equipment_loadout',
        outfitId: outfit.outfitId,
        subjectId: petId(outfit.pet),
        sceneStyles: [this.sceneStyle],
      };
    }
    return { ...(existing || {}), animations, models, mounts, outfits };
  }

  _registeredVfxPreset(fallback = 'celebration') {
    const binding = this.activeActivity?.registration?.assets?.vfx?.[0];
    return this.activityAssetResolver?.resolveVfx(binding)?.preset || fallback;
  }

  _ensureActivityAnimations(prepared) {
    for (const id of prepared.plan.participants) {
      const pet = this._petById(id);
      if (!pet) continue;
      const animation = prepared.animations.get(id);
      const expected = animation?.key || this._fallbackAnimationName(pet, prepared.plan.type);
      if (!expected) continue;
      const current = pet._animState || pet.animation;
      if (current !== expected) pet.playAnimation?.(expected);
    }
  }

  async _preparePetOutfit(pet, outfitId, token) {
    if (!pet?._originalModelJson || !this.equipmentService || this.sceneStyle !== 'original') return null;
    const characterId = petId(pet);
    const outfit = getCharacterOutfits(characterId).find(entry => entry.id === outfitId);
    if (!outfit) return null;
    try {
      const result = await this.equipmentService.resolveLoadout({
        characterId,
        variantId: 'original',
        baseModelJson: pet._baseModelJson || pet._originalModelJson,
        loadout: outfit.loadout,
      });
      if (!this._isCurrentToken(token)) return null;
      return {
        pet,
        outfitId,
        loadout: outfit.loadout,
        modelJson: result.modelJson,
        assetId: result.assetId,
      };
    } catch (error) {
      console.warn(`[TownSocial] ${petName(pet)} ${outfitId} outfit skipped:`, error.message);
      return null;
    }
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
      }), {
        kind: 'pet_costume',
        activityType: this.activeActivity?.plan.type,
        subjectId: petId(pet),
        name: part,
        prompt: `${part}；${placement}`,
      });
      if (!this._isCurrentToken(token)) return null;
      return { pet, modelJson: result.modelJson, assetId: result.assetId };
    } catch (error) {
      console.warn(`[TownSocial] ${petName(pet)} temporary mount skipped:`, error.message);
      return null;
    }
  }

  _applyPetMount(mount) {
    this._applyTemporaryPetModel(mount);
  }

  _applyPetOutfit(outfit) {
    this._applyTemporaryPetModel(outfit);
  }

  _applyTemporaryPetModel(replacement) {
    if (!replacement || this.temporaryPetModels.has(replacement.pet)) return;
    this.temporaryPetModels.set(replacement.pet, {
      modelJson: replacement.pet._originalModelJson,
      animations: { ...replacement.pet._animPlans },
      generatedAssetId: replacement.pet._generatedAssetId || null,
    });
    replacement.pet.replaceModelFromJson?.(replacement.modelJson, { preserveCurrentScale: true });
    replacement.pet._generatedAssetId = replacement.assetId;
  }

  async _prepareWorldMount(entity, part, placement, token) {
    const modelJson = this.worldObjects.getMetadata(entity).modelJson || entity._originalModelJson;
    if (!modelJson) return null;
    const mountKey = entity === this._church() ? 'church' : 'apple_tree';
    const registeredBinding = this.activeActivity?.registration?.assets?.mounts?.[mountKey];
    if (registeredBinding && this.activityAssetResolver) {
      try {
        const registered = await this.activityAssetResolver.resolveModel(registeredBinding);
        if (registered?.modelJson && this._isCurrentToken(token)) {
          return {
            entity,
            modelJson: registered.modelJson,
            assetId: registered.assetId,
            assetBinding: registeredBinding,
          };
        }
      } catch (error) {
        console.warn(`[TownSocial] Registered ${mountKey} mount skipped:`, error.message);
      }
    }
    try {
      const cacheKey = `world-mount:${modelRevision(modelJson)}:${part}:${placement}`;
      const result = await this.activityAssetCache.getOrCreateModel(cacheKey, () => this.aiActions.mountPart({
        modelJson,
        part,
        placement,
        name: `${entity.name}节日灯笼`,
        tags: ['church_town', 'new_year', 'temporary_mount'],
      }), {
        kind: 'world_mount',
        activityType: this.activeActivity?.plan.type,
        subjectId: this._objectId(entity),
        name: part,
        prompt: `${part}；${placement}`,
      });
      if (!this._isCurrentToken(token)) return null;
      return {
        entity,
        modelJson: result.modelJson,
        assetId: result.assetId,
        assetBinding: { kind: 'activity_cache', cacheKey, assetId: result.assetId },
      };
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
      persistenceMode: 'temporary',
      persistenceOriginal: {
        operation: metadata.operation || 'original',
        assetId: metadata.assetId || null,
      },
    });
    this.objectPlacement?.reconcileModel(mount.entity, { operation: 'mount' });
  }

  async _spawnEventProp(spec, plan, index, token) {
    const registeredBinding = this.activeActivity?.registration?.assets?.models?.[spec.id];
    if (registeredBinding && this.activityAssetResolver) {
      try {
        const registered = await this.activityAssetResolver.resolveModel(registeredBinding, {
          sizeProfile: spec.sizeProfile,
          footprint: spec.footprint,
        });
        if (registered?.modelJson && this._isCurrentToken(token)) {
          const prop = this._createEventPropEntity(spec, plan, index, registered);
          prop.assetBinding = registeredBinding;
          return prop;
        }
      } catch (error) {
        console.warn(`[TownSocial] Registered prop ${spec.id} skipped:`, error.message);
      }
    }
    if (spec.operation === 'library' && spec.libraryKey) {
      const libraryResult = await this.activityAssetCache.getModel(spec.libraryKey);
      if (libraryResult && this._isCurrentToken(token)) {
        return this._createEventPropEntity(spec, plan, index, libraryResult);
      }
    }
    const cacheKey = `event-prop:voxel:${spec.name}:${spec.prompt}`;
    const result = await this.activityAssetCache.getOrCreateModel(cacheKey, () => this.aiActions.createObject({
      description: spec.prompt,
      name: spec.name,
      quality: 'voxel',
      tags: ['church_town', 'social_event', plan.type],
    }), {
      kind: 'event_prop',
      activityType: plan.type,
      subjectId: spec.id,
      name: spec.name,
      prompt: spec.prompt,
    });
    if (!this._isCurrentToken(token)) return null;

    const prop = this._createEventPropEntity(spec, plan, index, result);
    prop.assetBinding = { kind: 'activity_cache', cacheKey, assetId: result.assetId };
    return prop;
  }

  _createEventPropEntity(spec, plan, index, result) {
    const desired = this._eventPropPosition(spec, plan, index);
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
      semantic: {
        profileId: spec.sizeProfile,
        name: spec.name,
        description: spec.prompt,
        category: 'decor',
      },
    }) || {
      editable: false,
      source: 'generated',
      footprint: spec.footprint,
    };
    placement.editable = false;
    placement.source = 'social_event';
    if (spec.heightOffset) entity.mesh.position.y += spec.heightOffset;
    this.scene.add(entity.mesh);
    this.worldObjects.add(entity, {
      modelJson: result.modelJson,
      operation: 'generate',
      assetId: result.assetId,
      placement,
    });
    const prop = {
      entity,
      spec,
      modelJson: result.modelJson,
      particleSystem: null,
      displayScale: entity.mesh.scale.clone(),
      transition: null,
    };
    entity.mesh.visible = false;
    this.eventProps.push(prop);
    return prop;
  }

  _eventPropPosition(spec, plan, index) {
    const layout = this.activeActivity?.registration?.layout || {};
    if (plan.type === 'new_year') {
      if (spec.revealStage === 'dance') {
        const fire = this._campfire()?.mesh?.position || this.center;
        return fire.clone().add(new THREE.Vector3(6.5, 0, 1.5));
      }
      const slot = Number(spec.layoutSlot) || 0;
      const z = spec.revealStage === 'food' ? 9.2 : 10;
      return this.center.clone().add(new THREE.Vector3(slot * (Number(layout.tableSpacing) || 6), 0, z));
    }
    return this.center.clone().add(new THREE.Vector3(
      plan.type === 'birthday' ? 8 : -7 + index * 4,
      0,
      plan.type === 'apple_pick' ? 7 : 4 + index * 3,
    ));
  }

  _revealPropsForStage(stage) {
    for (const prop of this.eventProps) {
      if (prop.spec.revealStage === stage) this._revealEventProp(prop);
    }
  }

  _revealEventProp(prop) {
    if (!prop || prop.entity.mesh.visible) return;
    prop.entity.mesh.visible = true;
    prop.transition = { type: 'appear', elapsed: 0, duration: 0.9 };
    prop.entity.mesh.scale.copy(prop.displayScale).multiplyScalar(0.08);
    this.vfxService?.playPreset('celebration', {
      target: prop.entity.mesh,
      key: `event-prop-reveal:${prop.spec.id}`,
      duration: 1.2,
    });
  }

  _updatePropTransitions(dt) {
    for (const prop of this.eventProps) {
      const transition = prop.transition;
      if (!transition) continue;
      transition.elapsed += dt;
      const progress = Math.min(1, transition.elapsed / transition.duration);
      const eased = 1 - ((1 - progress) ** 3);
      const factor = transition.type === 'appear'
        ? THREE.MathUtils.lerp(0.08, 1, eased)
        : THREE.MathUtils.lerp(1, 0.08, eased);
      prop.entity.mesh.scale.copy(prop.displayScale).multiplyScalar(factor);
      if (progress >= 1) prop.transition = null;
    }
  }

  _beginPropExit(reason) {
    if (!this.activeActivity) return false;
    if (!this.preparedActivity || this.eventProps.every(prop => !prop.entity.mesh.visible)) {
      return this.stopActivity(reason);
    }
    this.activeActivity.status = 'prop_exit';
    this.activeActivity.elapsed = 0;
    this.activeActivity.exitReason = reason;
    this.data.active.status = 'prop_exit';
    for (const prop of this.eventProps.filter(entry => entry.entity.mesh.visible)) {
      prop.transition = { type: 'disappear', elapsed: 0, duration: 1.1 };
      this.vfxService?.playPreset('celebration', {
        target: prop.entity.mesh,
        key: `event-prop-exit:${prop.spec.id}`,
        duration: 1.2,
      });
    }
    this._setActivityPresentation('星星把桌子和道具送回活动仓库');
    return true;
  }

  async _preparePropAnimation(prop, description, token) {
    try {
      const registeredBinding = this.activeActivity?.registration?.assets?.animations?.[prop.spec.id]?.main;
      if (registeredBinding && this.activityAssetResolver) {
        const registered = await this.activityAssetResolver.resolveAnimation(registeredBinding, {
          modelJson: prop.modelJson,
        });
        if (registered?.plan && this._isCurrentToken(token)) {
          prop.animationPlan = safePlan(registered.plan, true, Math.max(Number(registered.plan._duration) || 0, 2.8));
          prop.animationBinding = registeredBinding;
          return;
        }
      }
      const cacheKey = `prop-animation:${modelRevision(prop.modelJson)}:${description}:2.8:true`;
      const result = await this.activityAssetCache.getOrCreateAnimation(cacheKey, async () => {
        const generated = await this.contentPort.generateAnimation({
          modelJson: prop.modelJson,
          description,
          duration: 2.8,
          emitParticles: true,
        });
        return { plan: safePlan(generated.plan, true, 2.8) };
      }, {
        kind: 'prop_animation',
        activityType: this.activeActivity?.plan.type,
        subjectId: prop.spec.id,
        name: `${prop.spec.name}动作`,
        prompt: description,
      });
      if (!this._isCurrentToken(token)) return;
      prop.animationPlan = result.plan;
      prop.animationBinding = { kind: 'activity_cache', cacheKey };
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
    const layout = this.activeActivity?.registration?.layout || {};
    if (plan.type === 'apple_pick') {
      const tree = this._targetObject(plan.targetObjectIds[0]) || this._appleTrees()[0];
      if (tree) {
        const direction = this.center.clone().sub(tree.mesh.position).setY(0).normalize();
        const box = tree.getWorldBBox?.();
        const size = box?.getSize(new THREE.Vector3()) || new THREE.Vector3(3, 3, 3);
        const slots = [tree.mesh.position.clone().addScaledVector(
          direction,
          Math.max(size.x, size.z) * 0.5 + (Number(layout.sideClearance) || 1.3),
        )];
        return this._resolveReachableSlots(plan, slots, tree.mesh.position);
      }
    }
    if (plan.type === 'greeting') {
      const offsets = layout.offsets || [[-2.2, 0, 0], [2.2, 0, 0]];
      const slots = offsets.map(offset => focus.clone().add(new THREE.Vector3(...offset))).slice(0, count);
      return this._resolveReachableSlots(plan, slots, focus);
    }
    if (plan.type === 'birthday') {
      const slots = ringSlots(focus, count, Number(layout.ringRadius) || 5.8);
      const table = prepared.props.find(prop => prop.spec.id === 'birthday_table');
      const organizerIndex = plan.participants.indexOf('fangk');
      if (table && organizerIndex >= 0) {
        const offset = layout.organizerTableOffset || [0, 0, 7.8];
        slots[organizerIndex] = table.entity.mesh.position.clone().add(new THREE.Vector3(...offset));
      }
      return this._resolveReachableSlots(plan, slots, focus);
    }
    const radius = Number(layout.ringRadius) || (['campfire', 'party'].includes(plan.type) ? 7.2 : 6);
    return this._resolveReachableSlots(plan, ringSlots(focus, count, radius), focus);
  }

  _resolveReachableSlots(plan, desiredSlots, focus) {
    const selected = [];
    const count = Math.max(plan.participants.length, 1);
    const candidates = [];
    const baseRadius = desiredSlots.reduce((sum, slot) => sum + slot.distanceTo(focus), 0)
      / Math.max(desiredSlots.length, 1);
    for (const radius of [baseRadius, baseRadius + 2, Math.max(2.5, baseRadius - 1.5)]) {
      candidates.push(...ringSlots(focus, Math.max(24, count * 6), radius));
    }

    const isSeparated = candidate => selected.every(slot => slot.distanceToSquared(candidate) >= 4);
    for (let index = 0; index < plan.participants.length; index += 1) {
      const pet = this._petById(plan.participants[index]);
      const desired = desiredSlots[index] || desiredSlots[desiredSlots.length - 1] || focus;
      const ordered = [desired, ...candidates]
        .sort((a, b) => a.distanceToSquared(desired) - b.distanceToSquared(desired));
      const slot = ordered.find(candidate => (
        isSeparated(candidate) && this._petCanReach(pet, candidate)
      ));
      selected.push(slot?.clone() || pet?.mesh?.position?.clone() || desired.clone());
    }
    return selected;
  }

  _petCanReach(pet, target) {
    const navigation = pet?._navigation;
    const position = pet?.mesh?.position;
    if (!navigation || !position) return true;
    if (!navigation.isWalkableWorld(target)) return false;
    if (position.distanceToSquared(target) <= 0.25) return true;
    return navigation.findPath(position, target).length > 0;
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

  _resumeActivityPet(pet) {
    const prepared = this.preparedActivity;
    if (!this.activeActivity) return;
    if (this.activeActivity.status === 'preparing') {
      pet.unlockFacing?.();
      if (getPetStateMachine(pet).is(PET_STATES.FREE_ROAM)) {
        this.petManager.resumePet(pet);
      }
      return;
    }
    if (!prepared) return;
    const animation = this.activeActivity.status === 'birthday_intro'
      ? prepared.introAnimations.get(petId(pet))
      : prepared.animations.get(petId(pet));
    pet.unlockFacing?.();
    pet.lockFacing?.(prepared.focus.x, prepared.focus.z);
    pet.playAnimation?.(animation?.key || this._fallbackAnimationName(pet, prepared.plan.type));
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
