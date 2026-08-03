import { createPageLoadingScreen } from '../../../engine/ui/PageLoadingScreen.js';

export const CHII_LOADING_PRESETS = Object.freeze({
  island: Object.freeze({ title: '奇异岛正在醒来', detail: '宠物们正在把今天的路牌摆正。' }),
  prologue: Object.freeze({ title: '第一幕正在准备', detail: '请系好安全带，虽然它看起来有点松。' }),
  showcase: Object.freeze({ title: '角色们正在入场', detail: '大家正在认真排队，孔雀除外。' }),
  category: Object.freeze({ title: '正在调整展台', detail: '换一组角色上来，很快就好。' }),
  navigation: Object.freeze({ title: '正在换一条小路', detail: '路牌转个方向，马上就到。' }),
  sceneStyle: Object.freeze({ title: '正在更换岛上画风', detail: '树和花正在统一一下意见。' }),
});

export function createChiiPageLoadingScreen(options = {}) {
  return createPageLoadingScreen({
    brand: 'CHII ISLAND',
    presets: CHII_LOADING_PRESETS,
    ...options,
  });
}
