import * as THREE from 'three';
import { StaticEntity } from '../../../engine/entity/StaticEntity.js';
import { AIWorldActionService } from '../../../gameplay/ai/AIWorldActionService.js';
import { PET_STATES, getPetStateMachine } from '../../../gameplay/pets/PetStateMachine.js';
import { appendChiiGenerationConstraint } from '../data/worldTuningProfile.js';

export const BUILDING_LOT_OPTIONS = Object.freeze([
  Object.freeze({ key: '3x4', width: 3, depth: 4, label: '3 × 4 地块（小屋）' }),
  Object.freeze({ key: '4x4', width: 4, depth: 4, label: '4 × 4 地块（工坊）' }),
  Object.freeze({ key: '5x5', width: 5, depth: 5, label: '5 × 5 地块（公共建筑）' }),
]);

export function toPlacementFootprint(lot, subdivision = 1) {
  const factor = Math.max(1, Math.floor(Number(subdivision) || 1));
  return {
    width: Math.max(1, Math.round(lot.width * factor)),
    depth: Math.max(1, Math.round(lot.depth * factor)),
  };
}

export function createBuildingPrompt(description, lot) {
  const concrete = String(description || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 32);
  return appendChiiGenerationConstraint(
    `${concrete}，底部长宽比${lot.width}比${lot.depth}`,
    'building',
  );
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function makeDraftEntity({ position, footprint, cellSize }) {
  const mesh = new THREE.Group();
  mesh.name = '建筑占地预览';
  mesh.position.copy(position);

  const content = new THREE.Group();
  const geometry = new THREE.BoxGeometry(
    footprint.width * cellSize * 0.92,
    0.28,
    footprint.depth * cellSize * 0.92,
  );
  const material = new THREE.MeshBasicMaterial({
    color: 0xe9b44c,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  const preview = new THREE.Mesh(geometry, material);
  preview.position.y = 0.16;
  content.add(preview);
  mesh.add(content);

  const instanceId = `town-building-draft-${Date.now().toString(36)}`;
  return {
    _instanceId: instanceId,
    id: instanceId,
    name: '建筑占地预览',
    category: 'house',
    tags: ['建筑', '城镇', '占地预览'],
    mesh,
    _content: content,
    getWorldBBox() {
      mesh.updateWorldMatrix(false, true);
      return new THREE.Box3().setFromObject(preview);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

function petName(pet) {
  return pet?._petName || '螃蟹';
}

export class TownBuilderSystem {
  constructor({
    scene,
    player,
    petManager,
    builder,
    worldObjects,
    objectPlacement,
    objectEditor,
    contentPort,
    generatedAssetRepository,
    runtimeStatus = null,
    scaffoldModelJson = null,
    scaffoldAnimationPlan = null,
    setDialogueLock = null,
    vfxService = null,
  }) {
    this.scene = scene;
    this.player = player;
    this.petManager = petManager;
    this.builder = builder;
    this.worldObjects = worldObjects;
    this.objectPlacement = objectPlacement;
    this.objectEditor = objectEditor;
    this.runtimeStatus = runtimeStatus;
    this.scaffoldModelJson = scaffoldModelJson;
    this.scaffoldAnimationPlan = scaffoldAnimationPlan;
    this.setDialogueLock = setDialogueLock;
    this.vfxService = vfxService;
    this.aiActions = new AIWorldActionService({
      contentPort,
      assetRepository: generatedAssetRepository,
    });
    this.activeJob = null;
    this.scaffold = null;
    this.reveals = [];
  }

  isBuilder(pet) {
    return !!pet && pet === this.builder;
  }

  canInteract(pet) {
    if (!this.isBuilder(pet)) return false;
    const machine = getPetStateMachine(pet);
    return machine.is(PET_STATES.FREE_ROAM)
      || machine.is(PET_STATES.FOLLOWING)
      || machine.is(PET_STATES.WORKING);
  }

  getInteractionLabel() {
    return this.activeJob ? '问问螃蟹施工进度' : '请螃蟹修新建筑';
  }

  async interact(pet, dialogueSystem) {
    if (!this.isBuilder(pet)) return false;
    if (this.activeJob || getPetStateMachine(pet).is(PET_STATES.WORKING)) {
      await dialogueSystem.say({
        speakerName: petName(pet),
        text: '正忙着把房子摆正呢。横着走可以，房子可不能横着长。',
      });
      return false;
    }

    const snapshot = this._beginDialogue(pet);
    let handedToWork = false;
    let draft = null;
    try {
      const wasFollowing = snapshot.state === PET_STATES.FOLLOWING;
      const choice = await dialogueSystem.askChoice({
        speakerName: petName(pet),
        text: '今天要修点什么？我已经把两只钳子都点过名了。',
        options: [
          { key: 'build', label: '帮我修一栋新建筑吧！' },
          wasFollowing
            ? { key: 'free_roam', label: '先在广场自由活动吧！' }
            : { key: 'follow', label: '跟我一起逛逛吧！' },
          { key: 'nothing', label: '没什么。' },
        ],
      });
      if (!choice || choice.key === 'nothing') return false;
      if (choice.key === 'follow') {
        this._startFollowing(pet);
        handedToWork = true;
        return true;
      }
      if (choice.key === 'free_roam') {
        this._startFreeRoam(pet);
        handedToWork = true;
        return true;
      }

      const lotChoice = await dialogueSystem.askChoice({
        speakerName: petName(pet),
        text: '先定占地。房子不喜欢踩别人脚，我也不喜欢。',
        options: [
          ...BUILDING_LOT_OPTIONS.map(lot => ({ key: lot.key, label: lot.label })),
          { key: 'cancel', label: '先不修了。' },
        ],
      });
      const lot = BUILDING_LOT_OPTIONS.find(option => option.key === lotChoice?.key);
      if (!lot) return false;

      const footprint = toPlacementFootprint(lot, this.objectPlacement.grid.subdivision);
      const desired = this.player.mesh.position.clone().addScaledVector(
        this.player.orientation,
        Math.max(lot.width, lot.depth) * this.objectPlacement.grid.terrainUnit * 0.55,
      );
      desired.y = 0;
      draft = this._createDraft(desired, footprint, lot);

      this.setDialogueLock?.(false, pet);
      const placement = await this.objectEditor.openPlacementDraft(draft);
      if (!placement) return false;
      this.setDialogueLock?.(true, pet);

      let description = null;
      while (!description) {
        const input = await dialogueSystem.askInput({
          speakerName: petName(pet),
          text: `这块 ${lot.width} × ${lot.depth} 的地站稳了。想修什么建筑？`,
          placeholder: '例如：红瓦木墙的小型宠物工坊',
        });
        if (!input) return false;
        const concrete = String(input).replace(/\s+/g, ' ').trim().slice(0, 32);
        const confirmation = await dialogueSystem.askChoice({
          speakerName: petName(pet),
          text: `确定在这里修“${concrete}”吗？我敲下去可就算开工啦。`,
          options: [
            { key: 'confirm', label: '确定，开工吧！' },
            { key: 'rewrite', label: '我再改改描述。' },
            { key: 'cancel', label: '先不修了。' },
          ],
        });
        if (confirmation?.key === 'confirm') description = concrete;
        if (!confirmation || confirmation.key === 'cancel') return false;
      }

      draft.mesh.visible = false;
      const machine = getPetStateMachine(pet);
      machine.transition(PET_STATES.WORKING, {
        reason: 'town-building-started',
        resumeState: PET_STATES.FREE_ROAM,
      });
      pet.stopFollow?.();
      handedToWork = true;
      this.setDialogueLock?.(false, pet);
      this.activeJob = this._runBuild({ pet, draft, placement, lot, description })
        .catch(error => console.warn('[TownBuilder] Build failed:', error.message));
      return true;
    } finally {
      if (!handedToWork) {
        if (draft) this._removeDraft(draft);
        this._restoreDialogue(snapshot);
        this.setDialogueLock?.(false, pet);
      }
    }
  }

  update(dt) {
    this.scaffold?.updateAnimation?.(dt);
    for (let index = this.reveals.length - 1; index >= 0; index -= 1) {
      const reveal = this.reveals[index];
      reveal.time += dt;
      const t = Math.min(reveal.time / 1.1, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      reveal.entity._content.scale.setScalar(reveal.scale * eased);
      if (t >= 1) this.reveals.splice(index, 1);
    }
  }

  _beginDialogue(pet) {
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

  _restoreDialogue(snapshot) {
    const machine = getPetStateMachine(snapshot.pet);
    if (machine.is(PET_STATES.INTERACTING)) machine.resume('town-builder-dialogue-ended');
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

  _startFollowing(pet) {
    const machine = getPetStateMachine(pet);
    machine.transition(PET_STATES.FOLLOWING, { reason: 'town-builder-follow-requested' });
    machine.resumeState = null;
    pet.followTarget?.(this.player.mesh, 3, 6);
  }

  _startFreeRoam(pet) {
    const machine = getPetStateMachine(pet);
    machine.transition(PET_STATES.FREE_ROAM, { reason: 'town-builder-free-roam-requested' });
    machine.resumeState = null;
    pet.stopFollow?.();
    this.petManager.resumePet(pet);
  }

  _createDraft(desired, footprint, lot) {
    const free = this.objectPlacement.grid.findNearestAvailable(desired, footprint);
    if (!free) throw new Error('附近没有足够大的连续空地');
    const draft = makeDraftEntity({
      position: free.position,
      footprint,
      cellSize: this.objectPlacement.grid.cellSize,
    });
    draft.mesh.userData.buildingLot = lot;
    this.scene.add(draft.mesh);
    this.worldObjects.add(draft, {
      placement: {
        editable: true,
        source: 'building_draft',
        footprint,
        anchor: free.anchor,
      },
    });
    return draft;
  }

  async _runBuild({ pet, draft, placement, lot, description }) {
    const jobId = this.runtimeStatus?.startJob('螃蟹正在施工', '正在走到地块旁边');
    try {
      await this._moveToWorkSide(pet, placement.position, lot);
      this.scaffold = this._createScaffold(placement.position, lot);
      this.vfxService?.playPreset('dust', {
        position: placement.position,
        key: 'town-builder-dust',
        duration: 1.4,
      });
      pet.lockFacing?.(placement.position.x, placement.position.z);
      pet.playAnimation?.('construct');
      this.runtimeStatus?.updateJob(jobId, 'GPT Voxel 正在生成建筑');

      const prompt = createBuildingPrompt(description, lot);
      const result = await this.aiActions.createObject({
        description: prompt,
        name: description,
        quality: 'voxel',
        tags: ['church_town', 'building'],
      });

      this.runtimeStatus?.updateJob(jobId, '正在把建筑放入地块');
      const building = this._placeBuilding({
        modelJson: result.modelJson,
        assetId: result.assetId,
        description,
        prompt,
        placement,
        lot,
        draft,
      });
      this.vfxService?.playPreset('workStart', {
        target: building.mesh,
        key: 'town-builder-reveal',
        duration: 1.6,
      });
      draft = null;
      this.runtimeStatus?.completeJob(jobId, `${building.name} 已经修好`);
      return building;
    } catch (error) {
      this.runtimeStatus?.failJob(jobId, error);
      throw error;
    } finally {
      if (draft) this._removeDraft(draft);
      this._removeScaffold();
      pet.unlockFacing?.();
      pet.playAnimation?.('idle');
      const machine = getPetStateMachine(pet);
      if (machine.is(PET_STATES.WORKING)) machine.completeWork(PET_STATES.FREE_ROAM);
      this.petManager.resumePet(pet);
      this.activeJob = null;
    }
  }

  async _moveToWorkSide(pet, center, lot) {
    let direction = pet.mesh.position.clone().sub(center).setY(0);
    if (direction.lengthSq() < 0.01) direction.set(0, 0, 1);
    direction.normalize();
    const radius = Math.max(lot.width, lot.depth) * this.objectPlacement.grid.terrainUnit * 0.5 + 2;
    const stand = center.clone().addScaledVector(direction, radius);
    pet.walkTo?.(stand.x, stand.z, 4);
    const deadline = performance.now() + 8000;
    while (pet._targetPosition && performance.now() < deadline) await wait(80);
    pet.stopWalking?.();
  }

  _createScaffold(position, lot) {
    if (!this.scaffoldModelJson) return null;
    const scaffold = new StaticEntity({
      id: `town-scaffold-${Date.now().toString(36)}`,
      name: '施工区域',
      tags: ['施工'],
      category: 'decor',
      position: [position.x, 0, position.z],
      scale: 1,
      modelJson: this.scaffoldModelJson,
      mergeGeometry: false,
    });
    const box = scaffold.getWorldBBox?.();
    if (box && !box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3());
      const target = Math.max(lot.width, lot.depth) * this.objectPlacement.grid.terrainUnit + 1;
      scaffold._content.scale.setScalar(target / Math.max(size.x, size.z, 0.01));
    }
    if (this.scaffoldAnimationPlan) scaffold.playIdleAnimation(this.scaffoldAnimationPlan, 2.5);
    this.scene.add(scaffold.mesh);
    return scaffold;
  }

  _removeScaffold() {
    if (!this.scaffold) return;
    this.scene.remove(this.scaffold.mesh);
    this.scaffold = null;
  }

  _placeBuilding({ modelJson, assetId, description, prompt, placement, lot, draft }) {
    this._removeDraft(draft);
    const entity = new StaticEntity({
      id: `town-building-${assetId}`,
      name: modelJson.name || description,
      tags: ['建筑', '城镇', 'AI生成'],
      category: 'house',
      position: [placement.position.x, 0, placement.position.z],
      scale: 1,
      modelJson,
    });
    entity._generatedAssetId = assetId;
    entity.mesh.userData.townBuilding = true;
    const generatedPlacement = this.objectPlacement.prepareGeneratedEntity(
      entity,
      placement.position,
      {
        footprint: placement.footprint,
        semantic: {
          profileId: 'building',
          name: entity.name,
          description: prompt,
          category: 'house',
        },
      },
    );
    this.scene.add(entity.mesh);
    this.worldObjects.add(entity, {
      modelJson,
      operation: 'generate',
      assetId,
      prompt,
      lotSize: { width: lot.width, depth: lot.depth },
      placement: generatedPlacement,
    });
    const scale = entity._content.scale.x;
    entity._content.scale.setScalar(0.001);
    this.reveals.push({ entity, scale, time: 0 });
    return entity;
  }

  _removeDraft(draft) {
    if (!draft) return;
    this.worldObjects.remove(draft);
    this.scene.remove(draft.mesh);
    draft.dispose?.();
  }
}
