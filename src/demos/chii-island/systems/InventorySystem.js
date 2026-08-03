import {
  CHII_EQUIPMENT_ITEMS,
  getEquipmentShowcaseAnimation,
} from '../data/equipmentCatalog.js';
import { InventoryPanel } from '../presentation/InventoryPanel.js';
import { renderEquipmentThumbnails } from '../presentation/EquipmentThumbnailRenderer.js';

export class InventorySystem {
  constructor({
    input,
    player,
    baseModelJson,
    characterId = 'phrolova',
    variantId = 'a',
    equipmentService,
    panel = new InventoryPanel(),
    items = CHII_EQUIPMENT_ITEMS,
    onEquipped = null,
  } = {}) {
    if (!input || !player || !baseModelJson || !equipmentService) {
      throw new TypeError('InventorySystem requires input, player, baseModelJson, and equipmentService');
    }
    this.input = input;
    this.player = player;
    this.baseModelJson = baseModelJson;
    this.characterId = characterId;
    this.variantId = variantId;
    this.equipmentService = equipmentService;
    this.panel = panel;
    this.items = items;
    this.onEquipped = onEquipped;
    this.open = false;
    this.busy = false;
    this.equippedId = null;
    this.requestVersion = 0;
    this.disposed = false;

    panel
      .on('equip', itemId => this.equip(itemId))
      .on('clear', () => this.clear())
      .on('close', () => this.close());
    panel.setOpen(false);
    panel.setStatus('选一件喜欢的，拿在右手就能出发。');
    this.prepareThumbnails();
  }

  update({ canOpen = true } = {}) {
    if (this.disposed) return;
    if (!this.input.justPressed('KeyB')) return;
    if (this.open) {
      this.close();
    } else if (canOpen) {
      this.show();
    }
  }

  show() {
    if (this.disposed || this.open) return;
    this.open = true;
    this.input.setPointerLockEnabled(false);
    globalThis.document?.exitPointerLock?.();
    this.panel.setOpen(true);
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.panel.setOpen(false);
    this.input.setPointerLockEnabled(true);
  }

  isOpen() {
    return this.open;
  }

  async equip(itemId) {
    if (this.disposed || this.busy || itemId === this.equippedId) return false;
    const item = this.items.find(candidate => candidate.id === itemId);
    if (!item) return false;

    const version = ++this.requestVersion;
    this.busy = true;
    this.panel.setBusy(true, `正在把${item.name}稳稳放进右手...`);
    try {
      const result = await this.equipmentService.resolveLoadout({
        characterId: this.characterId,
        variantId: this.variantId,
        baseModelJson: this.baseModelJson,
        loadout: { rightHand: item.id },
      });
      if (this.disposed || version !== this.requestVersion) return false;
      if (!this.player.replaceModelFromJson(result.modelJson, {
        preserveCurrentTransform: true,
      })) {
        throw new Error('主角模型替换失败');
      }
      this.equippedId = item.id;
      this.panel.setEquipped(item.id);
      this.panel.setStatus(`${item.name}已经拿好，走路时别忘了它。`, 'complete');
      this.close();
      const animationPath = getEquipmentShowcaseAnimation(item, this.characterId, 'rightHand');
      Promise.resolve(this.onEquipped?.({ item, result, animationPath })).catch(error => {
        console.warn('[Inventory] Item showcase skipped:', error.message);
      });
      return true;
    } catch (error) {
      if (this.disposed) return false;
      console.warn('[Inventory] Equip failed:', error);
      this.panel.setStatus(`这次没拿稳：${error.message}`, 'error');
      return false;
    } finally {
      if (version === this.requestVersion) {
        this.busy = false;
        this.panel.setBusy(false);
      }
    }
  }

  clear() {
    if (this.disposed || this.busy || !this.equippedId) return false;
    const previous = this.items.find(item => item.id === this.equippedId);
    if (!this.player.replaceModelFromJson(this.baseModelJson, {
      preserveCurrentTransform: true,
    })) {
      this.panel.setStatus('东西暂时放不回去，再试一下。', 'error');
      return false;
    }
    this.equippedId = null;
    this.panel.setEquipped(null);
    this.panel.setStatus(`${previous?.name || '道具'}收回口袋了。`, 'complete');
    return true;
  }

  async prepareThumbnails() {
    try {
      const thumbnails = await renderEquipmentThumbnails(this.items, {
        loadModelJson: itemId => this.equipmentService.loadItemModel(itemId),
      });
      if (!this.disposed) this.panel.setThumbnails(thumbnails);
    } catch (error) {
      if (this.disposed) return;
      console.warn('[Inventory] Thumbnail rendering skipped:', error.message);
    }
  }

  getState() {
    return {
      open: this.open,
      busy: this.busy,
      equippedId: this.equippedId,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.requestVersion += 1;
    this.busy = false;
    this.open = false;
    this.panel.setOpen(false);
    this.input.setPointerLockEnabled(true);
    this.panel.dispose?.();
  }
}
