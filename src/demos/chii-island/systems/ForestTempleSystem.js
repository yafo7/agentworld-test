import * as THREE from 'three';
import { ArchitectNPC } from '../entities/ArchitectNPC.js';
import { ParticleSystem } from '../../../engine/animation/particles.js';
import { applyAnimation } from '../../../engine/animation/player.js';
import { defaultContentGeneration } from '../../../integrations/content/VoxelContentAdapter.js';
import { generatedAssets } from '../../../assets/repositories/GeneratedAssetRepository.js';
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

function waitForPet(pet, timeoutMs = 9000) {
  return new Promise((resolve) => {
    const start = performance.now();
    const timer = setInterval(() => {
      if (!pet._targetPosition || performance.now() - start >= timeoutMs) {
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
    runtimeStatus = null,
    contentPort = defaultContentGeneration,
    generatedAssetRepository = generatedAssets,
  }) {
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
    this.runtimeStatus = runtimeStatus;
    this.contentPort = contentPort;
    this.generatedAssetRepository = generatedAssetRepository;

    this.trophyState = 'idle';
    this.tentState = 'idle';
    this.campingPet = null;
    this.campingParticles = null;
    this.campingToken = 0;
    this.campingJobId = null;
    this.trophyAnimTime = 0;
    this.trophyPoseMap = null;
    this.generatedPets = [];
  }

  getFollowingPet() {
    return this.getPets().find(pet => pet.petState?.is('following') || pet._followEnabled) || null;
  }

  findInteraction(playerPosition, range = INTERACT_RANGE) {
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
    if (hit?.type === 'trophy') return this._interactTrophy(hit.pet);
    if (hit?.type === 'tent') return this._interactTent(hit.pet);
    return false;
  }

  async introducePet(pet) {
    if (!pet || pet._hasIntroduced !== false) return false;
    const confirmed = await this.dialogueSystem.askChoice({
      speakerName: pet._petName,
      text: `你好呀，我是${pet._petName}！一直听说奇异岛，这次终于可以来玩了！`,
      options: [{ key: 'hello', label: '你好你好！' }],
    });
    if (!confirmed) return true;
    pet._hasIntroduced = true;
    pet.hasIntroduced = true;
    pet._initialInteractionDone = true;
    const event = getAIWorldEvents('forest_pet').find(item => item.assetId === pet._generatedAssetId);
    if (event) recordAIWorldEvent({ ...event, hasIntroduced: true });
    return true;
  }

  async _interactTrophy(companion) {
    if (!companion || this.trophyState !== 'idle') return false;
    this.trophyState = 'dialogue';
    companion.stopFollow?.();
    companion.petState.enterTemporary('summoning_participant', 'following');

    try {
      const playerPetWish = await this.dialogueSystem.askInput({
        speakerName: '奖杯',
        text: '你期待邂逅什么样的生命？',
        placeholder: '例如：喜欢水的小动物',
      });
      if (!playerPetWish) return this._cancelSummon(companion);

      const playerMoodWish = await this.dialogueSystem.askInput({
        speakerName: '奖杯',
        text: '你这次来的心情如何呢？',
        placeholder: '输入期待的性格和特征',
      });
      if (!playerMoodWish) return this._cancelSummon(companion);

      const continued = await this.dialogueSystem.say({
        speakerName: '奖杯',
        text: '似乎你的伙伴也有些想要说的呢。',
      });
      if (!continued) return this._cancelSummon(companion);

      const companionPoint = this.trophy.mesh.position.clone().add(new THREE.Vector3(4.8, 0, 2.8));
      companion.walkTo?.(companionPoint.x, companionPoint.z, 4);
      await waitForPet(companion);
      companion.lockFacing?.(this.trophy.mesh.position.x, this.trophy.mesh.position.z);

      const companionWish = await this._makeCompanionWish(companion);
      const heard = await this.dialogueSystem.say({
        speakerName: companion._petName,
        text: companionWish,
      });
      if (!heard) return this._cancelSummon(companion);

      const accepted = await this.dialogueSystem.say({
        speakerName: '奖杯',
        text: '明白了，你想要的邂逅正在发生，去做些自己的事情吧。',
      });
      if (!accepted) return this._cancelSummon(companion);

      companion.unlockFacing?.();
      companion.petState.resume('summon-request-complete');
      companion.followTarget?.(this.player.mesh, 3.2, 6);
      this.trophyState = 'summoning';
      this.trophyAnimTime = 0;
      const summonJobId = this.runtimeStatus?.startJob('森林神殿正在召唤', '整理你们的愿望');
      this._runSummon({
        playerPetWish,
        playerMoodWish,
        companionWish,
        companionProfile: companion._profile || {},
        summonJobId,
      }).catch(error => {
        console.warn('[ForestTemple] summon failed:', error.message);
        this.runtimeStatus?.failJob(summonJobId, error);
        this._stopTrophyAnimation();
        this.trophyState = 'idle';
      });
      return true;
    } catch (error) {
      this._cancelSummon(companion);
      throw error;
    }
  }

  _cancelSummon(companion) {
    companion.unlockFacing?.();
    companion.petState.transition('following', { reason: 'summon-cancelled' });
    companion.followTarget?.(this.player.mesh, 3.2, 6);
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
    this.runtimeStatus?.updateJob(context.summonJobId, '提炼新宠物外形');
    const finalModelPrompt = await this._makeFinalPrompt(context);
    if (!finalModelPrompt) throw new Error('GPT 未生成有效宠物外形描述');

    this.runtimeStatus?.updateJob(context.summonJobId, 'AI 正在生成新宠物');
    const [{ modelJson }, petName, specialPrompt] = await Promise.all([
      this.contentPort.generateModel({ description: finalModelPrompt, quality: 'voxel' }),
      this._makePetName(finalModelPrompt),
      this._makeSpecialPrompt(finalModelPrompt),
    ]);

    const animationRequests = [
      ['idle', '轻轻呼吸摇晃', 2.5, false],
      ['run', '快速向前奔跑', 2.0, false],
      ['jump', '开心向上跳跃', 1.8, false],
      ['special', specialPrompt, 2.5, true],
    ];
    const animations = {};
    this.runtimeStatus?.updateJob(context.summonJobId, '正在生成四种动作');
    for (const [name, prompt, duration, particles] of animationRequests) {
      const result = await this.contentPort.generateAnimation({
        modelJson,
        description: prompt,
        duration,
        emitParticles: particles,
      });
      animations[name] = result.plan;
    }

    this.runtimeStatus?.updateJob(context.summonJobId, '正在保存宠物资产');
    const { assetId } = await this.generatedAssetRepository.saveModel({
      name: petName,
      description: finalModelPrompt,
      modelJson,
      tags: ['pet', 'forest_summon'],
    });
    for (const [name, plan] of Object.entries(animations)) {
      await this.generatedAssetRepository.saveAnimation({
        modelId: assetId,
        name,
        plan,
        type: name === 'idle' ? 'idle' : name,
      });
    }

    const pet = this._spawnGeneratedPet({
      petName,
      modelJson,
      animations,
      finalModelPrompt,
      context,
      specialPrompt,
      assetId,
    });
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
    this.trophyState = 'complete';
    this.runtimeStatus?.completeJob(context.summonJobId, `${petName} 已经来到奇异岛`);
  }

  _spawnGeneratedPet({ petName, modelJson, animations, finalModelPrompt, context, specialPrompt, assetId, position = null, hasIntroduced = false }) {
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
    pet.loadModelFromJson(modelJson);
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
    if (!pet) return false;
    if (this.tentState === 'camping') {
      const choice = await this.dialogueSystem.askChoice({
        speakerName: this.campingPet?._petName || '宠物',
        text: '还要继续露营吗？',
        options: [{ key: 'leave', label: '我们回去吧！' }],
      });
      if (choice?.key === 'leave') this._endCamping();
      return true;
    }

    if (this.tentState !== 'idle' || (!pet.petState?.is('following') && !pet._followEnabled)) return false;
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
        console.warn('[ForestTemple] camping animation failed:', error.message);
        this.runtimeStatus?.failJob(this.campingJobId, error);
      });
    } else {
      this.runtimeStatus?.completeJob(this.campingJobId, '露营舞会开始了');
    }
    return true;
  }

  async _prepareCampingAnimation(pet, token) {
    const modelJson = pet._originalModelJson;
    if (!modelJson) throw new Error('宠物缺少模型数据');
    this.runtimeStatus?.updateJob(this.campingJobId, 'AI 正在准备跳舞动作');
    const result = await this.contentPort.generateAnimation({
      modelJson,
      description: '宠物在帐篷旁开心跳舞',
      duration: 3,
      emitParticles: true,
    });
    if (token !== this.campingToken) return;
    pet.loadAnimation('camping', result.plan);
    this.runtimeStatus?.completeJob(this.campingJobId, '露营舞会开始了');
  }

  _startCampingDance() {
    const pet = this.campingPet;
    if (!pet || !pet._animPlans?.camping) return;
    pet.playAnimation('camping');
    if (!this.campingParticles && pet._modelGroup) {
      this.campingParticles = new ParticleSystem(this.scene);
      this.campingParticles.setup(pet._animPlans.camping, pet._modelGroup);
    }
  }

  _endCamping() {
    const pet = this.campingPet;
    this.campingToken++;
    if (this.campingParticles) {
      this.campingParticles.dispose();
      this.campingParticles = null;
    }
    if (pet) {
      pet.stopWalking?.();
      pet.petState.resume('camping-ended');
      pet.playAnimation?.('idle');
      pet.followTarget?.(this.player.mesh, 3.2, 6);
    }
    this.campingPet = null;
    this.campingJobId = null;
    this.tentState = 'idle';
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
}
