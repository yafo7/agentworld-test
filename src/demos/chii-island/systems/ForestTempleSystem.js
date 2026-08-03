import * as THREE from 'three';
import { ArchitectNPC } from '../entities/ArchitectNPC.js';
import { CHII_PET_HEIGHTS } from '../data/worldTuningProfile.js';
import { ParticleSystem } from '../../../engine/animation/particles.js';
import { applyAnimation } from '../../../engine/animation/player.js';
import { getAIWorldEvents, recordAIWorldEvent } from '../../../storage/aiWorldState.js';

const INTERACT_RANGE = 6;

function horizontalDistance(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function cleanLine(text, maxLength = 38) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/^(答案|描述|名称|动作)[:：]\s*/i, '')
    .replace(/\s+/g, '')
    .split(/[。！？\n]/)[0]
    .slice(0, maxLength);
}

function normalizePlan(raw) {
  if (!raw) return null;
  if (raw.motionPlan) {
    return { ...raw.motionPlan, _duration: raw.duration || 2, _loop: true };
  }
  return raw;
}

function waitForPet(pet, timeoutMs = 9000, isActive = () => true) {
  return new Promise((resolve) => {
    const start = performance.now();
    const timer = setInterval(() => {
      if (!isActive() || !pet._targetPosition || performance.now() - start >= timeoutMs) {
        clearInterval(timer);
        resolve();
      }
    }, 80);
  });
}

export class ForestTempleSystem {
  constructor({
    scene,
    physics,
    player,
    petManager,
    dialogueSystem,
    trophyEntity,
    tentEntity,
    trophyWaitPlan,
    getPets,
    onPetSpawned = null,
    onResidentSummoned = null,
    runtimeStatus = null,
    contentPort,
    generatedAssetRepository,
    vfxService = null,
  }) {
    if (!contentPort || !generatedAssetRepository) {
      throw new TypeError('ForestTempleSystem requires content and generated asset dependencies');
    }
    this.scene = scene;
    this.physics = physics;
    this.player = player;
    this.petManager = petManager;
    this.dialogueSystem = dialogueSystem;
    this.trophy = trophyEntity;
    this.tent = tentEntity;
    this.trophyWaitPlan = normalizePlan(trophyWaitPlan);
    this.getPets = getPets;
    this.onPetSpawned = onPetSpawned;
    this.onResidentSummoned = onResidentSummoned;
    this.runtimeStatus = runtimeStatus;
    this.contentPort = contentPort;
    this.generatedAssetRepository = generatedAssetRepository;
    this.vfxService = vfxService;

    this.trophyState = 'idle';
    this.tentState = 'idle';
    this.campingPet = null;
    this.campingParticles = null;
    this.campingToken = 0;
    this.campingJobId = null;
    this.trophyAnimTime = 0;
    this.trophyPoseMap = null;
    this.generatedPets = [];
    this._disposed = false;
    this._summonToken = 0;
    this._summoningPet = null;
  }

  getFollowingPet() {
    if (this._disposed) return null;
    return this.getPets().find(pet => pet.petState?.is('following')) || null;
  }

  findInteraction(playerPosition, range = INTERACT_RANGE) {
    if (this._disposed) return null;
    const hits = [];
    const followingPet = this.getFollowingPet();

    if (this.trophy && this.trophyState === 'idle' && followingPet) {
      const distance = horizontalDistance(playerPosition, this.trophy.mesh.position);
      if (distance <= range) {
        hits.push({
          type: 'trophy',
          distance,
          position: this.trophy.mesh.position,
          label: '向奖杯许愿',
          pet: followingPet,
        });
      }
    }

    const tentPet = this.tentState === 'camping' ? this.campingPet : followingPet;
    if (this.tent && tentPet) {
      const distance = horizontalDistance(playerPosition, this.tent.mesh.position);
      if (distance <= range) {
        hits.push({
          type: 'tent',
          distance,
          position: this.tent.mesh.position,
          label: this.tentState === 'camping' ? '结束露营' : '和宠物一起露营',
          pet: tentPet,
        });
      }
    }

    hits.sort((a, b) => a.distance - b.distance);
    return hits[0] || null;
  }

  async interact(hit) {
    if (this._disposed) return false;
    if (hit?.type === 'trophy') return this._interactTrophy(hit.pet);
    if (hit?.type === 'tent') return this._interactTent(hit.pet);
    return false;
  }

  async introducePet(pet) {
    if (this._disposed || !pet || pet._hasIntroduced !== false) return false;
    const confirmed = await this.dialogueSystem.askChoice({
      speakerName: pet._petName,
      text: `你好呀，我是${pet._petName}！一直听说奇异岛，这次终于可以来玩了！`,
      options: [{ key: 'hello', label: '你好你好！' }],
    });
    if (this._disposed) return false;
    if (!confirmed) return true;
    pet._hasIntroduced = true;
    pet.hasIntroduced = true;
    pet._initialInteractionDone = true;
    const event = getAIWorldEvents('forest_pet').find(item => item.assetId === pet._generatedAssetId);
    if (event) recordAIWorldEvent({ ...event, hasIntroduced: true });
    return true;
  }

  async restoreSavedPets(events = null) {
    if (this._disposed) return [];
    const restored = [];
    const savedEvents = events ?? getAIWorldEvents('forest_pet');
    for (const event of savedEvents) {
      if (this._disposed) break;
      if (!event?.assetId || this.petManager.pets.some(pet => pet._generatedAssetId === event.assetId)) {
        continue;
      }
      try {
        const asset = await this.generatedAssetRepository.get(event.assetId);
        if (this._disposed) break;
        if (!asset?.modelJson) throw new Error('saved pet model is unavailable');
        const animations = Object.fromEntries((asset.animations || [])
          .filter(entry => entry?.plan)
          .map(entry => [entry.type || entry.name, entry.plan]));
        const pet = this._spawnGeneratedPet({
          petName: event.petName || asset.modelJson.name || 'New friend',
          modelJson: asset.modelJson,
          animations,
          finalModelPrompt: event.finalModelPrompt || asset.modelJson.name || 'forest pet',
          context: {
            playerMoodWish: event.mood || '',
          },
          specialPrompt: event.specialPrompt || '开心挥手',
          assetId: event.assetId,
          position: event.position || null,
          hasIntroduced: event.hasIntroduced === true,
        });
        if (pet) restored.push(pet);
      } catch (error) {
        console.warn(`[ForestTemple] Saved pet ${event.assetId} skipped:`, error.message);
      }
    }
    if (restored.length > 0) this.trophyState = 'complete';
    return restored;
  }

  async _interactTrophy(companion) {
    if (this._disposed || !companion || this.trophyState !== 'idle') return false;
    const summonToken = ++this._summonToken;
    this._summoningPet = companion;
    this.trophyState = 'dialogue';
    companion.stopFollow?.();
    companion.petState.enterTemporary('summoning_participant', 'following');

    try {
      const playerPetWish = await this.dialogueSystem.askInput({
        speakerName: '奖杯',
        text: '你期待邂逅什么样的生命？',
        placeholder: '例如：喜欢水的小动物',
      });
      if (!this._isSummonActive(summonToken)) return false;
      if (!playerPetWish) return this._cancelSummon(companion, summonToken);

      const playerMoodWish = await this.dialogueSystem.askInput({
        speakerName: '奖杯',
        text: '你这次来的心情如何呢？',
        placeholder: '输入期待的性格和特征',
      });
      if (!this._isSummonActive(summonToken)) return false;
      if (!playerMoodWish) return this._cancelSummon(companion, summonToken);

      const continued = await this.dialogueSystem.say({
        speakerName: '奖杯',
        text: '似乎你的伙伴也有些想要说的呢。',
      });
      if (!this._isSummonActive(summonToken)) return false;
      if (!continued) return this._cancelSummon(companion, summonToken);

      const companionPoint = this.trophy.mesh.position.clone().add(new THREE.Vector3(4.8, 0, 2.8));
      companion.walkTo?.(companionPoint.x, companionPoint.z, 4);
      await waitForPet(companion, 9000, () => this._isSummonActive(summonToken));
      if (!this._isSummonActive(summonToken)) return false;
      companion.lockFacing?.(this.trophy.mesh.position.x, this.trophy.mesh.position.z);

      const companionWish = await this._makeCompanionWish(companion);
      if (!this._isSummonActive(summonToken)) return false;
      const heard = await this.dialogueSystem.say({
        speakerName: companion._petName,
        text: companionWish,
      });
      if (!this._isSummonActive(summonToken)) return false;
      if (!heard) return this._cancelSummon(companion, summonToken);

      const accepted = await this.dialogueSystem.say({
        speakerName: '奖杯',
        text: '明白了，你想要的邂逅正在发生，去做些自己的事情吧。',
      });
      if (!this._isSummonActive(summonToken)) return false;
      if (!accepted) return this._cancelSummon(companion, summonToken);

      this._resumeSummoningPet(companion, 'summon-request-complete');
      this.trophyState = 'summoning';
      this.trophyAnimTime = 0;
      this.vfxService?.playPreset('summon', {
        target: this.trophy.mesh,
        key: 'forest-temple-summon',
      });
      const summonJobId = this.runtimeStatus?.startJob('森林神殿正在召唤', '整理你们的愿望');
      this._runSummon({
        playerPetWish,
        playerMoodWish,
        companionWish,
        companionProfile: companion._profile || {},
        summonJobId,
        summonToken,
      }).catch(error => {
        if (!this._isSummonActive(summonToken)) return;
        console.warn('[ForestTemple] summon failed:', error.message);
        this.runtimeStatus?.failJob(summonJobId, error);
        this.vfxService?.stop('forest-temple-summon');
        this._stopTrophyAnimation();
        this.trophyState = 'idle';
      });
      return true;
    } catch (error) {
      if (!this._isSummonActive(summonToken)) return false;
      this._cancelSummon(companion, summonToken);
      throw error;
    }
  }

  _isSummonActive(token) {
    return !this._disposed && token === this._summonToken;
  }

  _resumeSummoningPet(companion, reason) {
    if (!companion) return;
    companion.unlockFacing?.();
    if (companion.petState?.is('summoning_participant')) {
      companion.stopWalking?.();
      companion.petState.resume(reason);
    }
    if (companion.petState?.is('following')) {
      companion.followTarget?.(this.player.mesh, 3.2, 6);
    }
    if (this._summoningPet === companion) this._summoningPet = null;
  }

  _cancelSummon(companion, summonToken = this._summonToken) {
    if (!this._isSummonActive(summonToken)) return false;
    ++this._summonToken;
    this._resumeSummoningPet(companion, 'summon-cancelled');
    this.trophyState = 'idle';
    return false;
  }

  async _makeCompanionWish(pet) {
    const profile = pet._profile || {};
    const fallback = `我希望新朋友能和我一样喜欢${profile.favoriteActions?.[0] || '一起玩'}！`;
    try {
      const content = await this.contentPort.chat({
        messages: [
          {
            role: 'system',
            content: '你是奇异岛宠物。根据资料只说一句简短中文愿望，使用第一人称，不解释。',
          },
          {
            role: 'user',
            content: [
              `名字:${pet._petName}`,
              `性格:${(profile.personalityTags || []).join('、')}`,
              `特点:${(profile.featureTags || []).join('、')}`,
              `能力:${(profile.abilityTags || []).join('、')}`,
              `喜欢:${(profile.favoriteActions || []).join('、')}`,
            ].join('\n'),
          },
        ],
        profile: 'pro',
        temperature: 0.6,
        maxTokens: 100,
      });
      return cleanLine(content, 34) || fallback;
    } catch (_) {
      return fallback;
    }
  }

  async _makeFinalPrompt(context) {
    const profile = context.companionProfile || {};
    const content = await this.contentPort.chat({
      messages: [
        {
          role: 'system',
          content: [
            '你是体素宠物外形提炼器。',
            '只输出一句简短、具体、可视化的中文宠物外形描述。',
            '必须包含动物原型或身体形态，以及1到3个明显视觉特征。',
            '不要解释、故事、分析、世界观或抽象氛围词。',
          ].join(''),
        },
        {
          role: 'user',
          content: [
            `玩家想邂逅:${context.playerPetWish}`,
            `玩家心情与性格期待:${context.playerMoodWish}`,
            `伙伴愿望:${context.companionWish}`,
            `伙伴性格:${(profile.personalityTags || []).join('、')}`,
            `伙伴特点:${(profile.featureTags || []).join('、')}`,
            `伙伴能力:${(profile.abilityTags || []).join('、')}`,
          ].join('\n'),
        },
      ],
      profile: 'pro',
      temperature: 0.3,
      maxTokens: 120,
    });
    return cleanLine(content, 32);
  }

  async _makePetName(finalModelPrompt) {
    try {
      const content = await this.contentPort.chat({
        messages: [
          { role: 'system', content: '只输出一个2到4个汉字的宠物名字，不解释。' },
          { role: 'user', content: finalModelPrompt },
        ],
        profile: 'pro',
        temperature: 0.7,
        maxTokens: 30,
      });
      return cleanLine(content, 4) || '新朋友';
    } catch (_) {
      return '新朋友';
    }
  }

  async _makeSpecialPrompt(finalModelPrompt) {
    try {
      const content = await this.contentPort.chat({
        messages: [
          { role: 'system', content: '只输出一个5到10字的具体宠物动作，不解释，不写氛围。' },
          { role: 'user', content: `宠物外形:${finalModelPrompt}\n动作要体现其可见特征。` },
        ],
        profile: 'pro',
        temperature: 0.4,
        maxTokens: 40,
      });
      return cleanLine(content, 10) || '开心挥舞双手';
    } catch (_) {
      return '开心挥舞双手';
    }
  }

  async _runSummon(context) {
    const summonToken = context.summonToken ?? this._summonToken;
    if (!this._isSummonActive(summonToken)) return;
    this.runtimeStatus?.updateJob(context.summonJobId, '提炼新宠物外形');
    const finalModelPrompt = await this._makeFinalPrompt(context);
    if (!this._isSummonActive(summonToken)) return;
    if (!finalModelPrompt) throw new Error('GPT 未生成有效宠物外形描述');

    this.runtimeStatus?.updateJob(context.summonJobId, 'AI 正在生成新宠物');
    const [{ modelJson }, petName, specialPrompt] = await Promise.all([
      this.contentPort.generateModel({ description: finalModelPrompt, quality: 'voxel' }),
      this._makePetName(finalModelPrompt),
      this._makeSpecialPrompt(finalModelPrompt),
    ]);
    if (!this._isSummonActive(summonToken)) return;

    const animationRequests = [
      ['idle', '轻轻呼吸摇晃', 2.5, false],
      ['run', '快速向前奔跑', 2.0, false],
      ['jump', '开心向上跳跃', 1.8, false],
      ['special', specialPrompt, 2.5, true],
    ];
    const animations = {};
    this.runtimeStatus?.updateJob(context.summonJobId, '正在生成四种动作');
    for (const [name, prompt, duration, particles] of animationRequests) {
      if (!this._isSummonActive(summonToken)) return;
      const result = await this.contentPort.generateAnimation({
        modelJson,
        description: prompt,
        duration,
        emitParticles: particles,
      });
      if (!this._isSummonActive(summonToken)) return;
      animations[name] = result.plan;
    }

    if (!this._isSummonActive(summonToken)) return;
    this.runtimeStatus?.updateJob(context.summonJobId, '正在保存宠物资产');
    const { assetId } = await this.generatedAssetRepository.saveModel({
      name: petName,
      description: finalModelPrompt,
      modelJson,
      tags: ['pet', 'forest_summon'],
    });
    if (!this._isSummonActive(summonToken)) return;
    for (const [name, plan] of Object.entries(animations)) {
      await this.generatedAssetRepository.saveAnimation({
        modelId: assetId,
        name,
        plan,
        type: name === 'idle' ? 'idle' : name,
      });
      if (!this._isSummonActive(summonToken)) return;
    }

    if (!this._isSummonActive(summonToken)) return;
    const pet = this._spawnGeneratedPet({
      petName,
      modelJson,
      animations,
      finalModelPrompt,
      context,
      specialPrompt,
      assetId,
    });
    if (!pet || !this._isSummonActive(summonToken)) return;
    recordAIWorldEvent({
      id: `forest_pet:${assetId}`,
      type: 'forest_pet',
      assetId,
      petName,
      finalModelPrompt,
      specialPrompt,
      mood: cleanLine(context.playerMoodWish, 16),
      position: pet.mesh.position.toArray(),
      hasIntroduced: false,
    });
    this._stopTrophyAnimation();
    this.vfxService?.stop('forest-temple-summon');
    this.trophyState = 'complete';
    this.runtimeStatus?.completeJob(context.summonJobId, `${petName} 已经来到奇异岛`);
    this._notifyResidentSummoned(pet);
  }

  _notifyResidentSummoned(pet) {
    if (this._disposed || typeof this.onResidentSummoned !== 'function') return;
    const payload = {
      residentId: pet?._petId || pet?._generatedAssetId || null,
      residentName: pet?._petName || null,
      assetId: pet?._generatedAssetId || null,
    };
    try {
      Promise.resolve(this.onResidentSummoned(payload)).catch(error => {
        console.warn('[ForestTemple] Story progression notification failed:', error.message);
      });
    } catch (error) {
      console.warn('[ForestTemple] Story progression notification failed:', error.message);
    }
  }

  _spawnGeneratedPet({ petName, modelJson, animations, finalModelPrompt, context, specialPrompt, assetId, position = null, hasIntroduced = false }) {
    if (this._disposed) return null;
    const pet = new ArchitectNPC();
    const spawn = position
      ? new THREE.Vector3(...position)
      : this.trophy.mesh.position.clone().add(new THREE.Vector3(-5.5, 0, 3.5));
    pet.mesh.name = petName;
    pet._petId = assetId;
    pet._petName = petName;
    pet._generatedAssetId = assetId;
    pet._hasIntroduced = hasIntroduced;
    pet.hasIntroduced = hasIntroduced;
    pet._initialInteractionDone = true;
    pet.loadModelFromJson(modelJson, { targetHeight: CHII_PET_HEIGHTS.generated });
    for (const [name, plan] of Object.entries(animations)) pet.loadAnimation(name, plan);
    pet.setPosition(spawn.x, 0, spawn.z);
    pet.setOrigin(spawn.x, 0, spawn.z);
    pet.initPhysics(this.physics);
    this.scene.add(pet.mesh);

    const profile = {
      id: assetId,
      name: petName,
      species: finalModelPrompt,
      personalityTags: [cleanLine(context.playerMoodWish, 12)].filter(Boolean),
      featureTags: [finalModelPrompt],
      abilityTags: [specialPrompt],
      favoriteActions: ['follow', 'play'],
      preferredObjects: ['forest', 'temple'],
      autonomousBehavior: ['idle', 'run'],
    };
    this.petManager.registerPet(pet, {
      name: petName,
      profile,
      spawn: [spawn.x, 0, spawn.z],
      initialState: 'free_roam',
      region: 'church_town',
      bounds: {
        minX: spawn.x - 10,
        maxX: spawn.x + 10,
        minZ: spawn.z - 10,
        maxZ: spawn.z + 10,
      },
    });
    this.generatedPets.push(pet);
    this.onPetSpawned?.(pet);
    return pet;
  }

  async _interactTent(pet) {
    if (this._disposed || !pet) return false;
    if (this.tentState === 'camping') {
      const choice = await this.dialogueSystem.askChoice({
        speakerName: this.campingPet?._petName || '宠物',
        text: '还要继续露营吗？',
        options: [{ key: 'leave', label: '我们回去吧！' }],
      });
      if (this._disposed) return false;
      if (choice?.key === 'leave') this._endCamping();
      return true;
    }

    if (this.tentState !== 'idle' || !pet.petState?.is('following')) return false;
    this.tentState = 'camping';
    this.campingPet = pet;
    const token = ++this.campingToken;
    pet.stopFollow?.();
    pet.petState.enterTemporary('camping', 'following');
    this.campingJobId = this.runtimeStatus?.startJob(`${pet._petName} 正在准备露营`, '走到帐篷旁');
    const campPoint = this.tent.mesh.position.clone().add(new THREE.Vector3(0, 0, 6));
    pet.walkTo?.(campPoint.x, campPoint.z, 4);

    if (!pet._animPlans?.camping) {
      this._prepareCampingAnimation(pet, token).catch(error => {
        if (this._disposed || token !== this.campingToken) return;
        console.warn('[ForestTemple] camping animation failed:', error.message);
        this.runtimeStatus?.failJob(this.campingJobId, error);
      });
    } else {
      this.runtimeStatus?.completeJob(this.campingJobId, '露营舞会开始了');
    }
    return true;
  }

  async _prepareCampingAnimation(pet, token) {
    if (this._disposed || token !== this.campingToken) return;
    const modelJson = pet._originalModelJson;
    if (!modelJson) throw new Error('宠物缺少模型数据');
    this.runtimeStatus?.updateJob(this.campingJobId, 'AI 正在准备跳舞动作');
    const result = await this.contentPort.generateAnimation({
      modelJson,
      description: '宠物在帐篷旁开心跳舞',
      duration: 3,
      emitParticles: true,
    });
    if (this._disposed || token !== this.campingToken) return;
    pet.loadAnimation('camping', result.plan);
    this.runtimeStatus?.completeJob(this.campingJobId, '露营舞会开始了');
  }

  _startCampingDance() {
    if (this._disposed) return;
    const pet = this.campingPet;
    if (!pet || !pet._animPlans?.camping) return;
    pet.playAnimation('camping');
    if (!this.campingParticles && pet._modelGroup) {
      this.campingParticles = new ParticleSystem(this.scene);
      this.campingParticles.setup(pet._animPlans.camping, pet._modelGroup);
    }
  }

  _endCamping(reason = 'camping-ended') {
    const pet = this.campingPet;
    this.campingToken++;
    if (this.campingParticles) {
      this.campingParticles.dispose();
      this.campingParticles = null;
    }
    if (pet?.petState?.is('camping')) {
      pet.stopWalking?.();
      pet.petState.resume(reason);
      pet.playAnimation?.('idle');
      if (pet.petState.is('following')) {
        pet.followTarget?.(this.player.mesh, 3.2, 6);
      }
    }
    this.campingPet = null;
    this.campingJobId = null;
    this.tentState = this._disposed ? 'disposed' : 'idle';
  }

  _stopTrophyAnimation() {
    if (this.trophyPoseMap && this.trophy?._modelGroup) {
      for (const [partId, base] of this.trophyPoseMap) {
        const object = this.trophy._modelGroup.getObjectByName(partId);
        if (!object) continue;
        object.position.copy(base.position);
        object.rotation.copy(base.rotation);
        object.scale.copy(base.scale);
      }
    }
    this.trophyPoseMap = null;
    this.trophyAnimTime = 0;
  }

  update(dt) {
    if (this._disposed) return;
    if (this.trophyState === 'summoning' && this.trophyWaitPlan && this.trophy?._modelGroup) {
      this.trophyAnimTime += dt;
      const duration = this.trophyWaitPlan._duration || 2;
      this.trophyPoseMap = applyAnimation(
        this.trophyWaitPlan,
        duration,
        this.trophy._modelGroup,
        this.trophyAnimTime % duration,
        this.trophyPoseMap
      );
    }

    if (this.tentState === 'camping' && this.campingPet) {
      if (!this.campingPet._targetPosition && this.campingPet._animPlans?.camping) {
        if (this.campingPet._animState !== 'camping') this._startCampingDance();
      }
      if (this.campingParticles) {
        this.campingParticles.update(dt, this.campingPet._modelGroup);
      }
    }
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    ++this._summonToken;
    this._resumeSummoningPet(this._summoningPet, 'forest-system-disposed');
    this._endCamping('forest-system-disposed');
    this._stopTrophyAnimation();
    this.vfxService?.stop('forest-temple-summon');
    this.trophyState = 'disposed';
    this.tentState = 'disposed';
  }
}
