/**
 * Chii Island — demo-specific configuration.
 * All world layout, pet configs, and environment definitions live here.
 */

import { Environment } from '../../engine';
import { StaticEntity } from '../../engine';
import { Pet } from '../../engine';
import { Item } from '../../engine';
import { createUnitEnvironment, getGridWorldPosition, paintUnitArea } from '../../engine';
import { createLights } from '../../engine';
import { ThirdPersonCamera } from '../../engine';
import { createRenderer } from '../../engine';
import { createScene } from '../../engine';

export const ENV_SPACING = 23;

export const envGridConfigs = [
  // row 0 (z = -ENV_SPACING)
  { name: '待售空地', center: [-ENV_SPACING, -ENV_SPACING], modelName: 'sun_stone', color: 0x999999, size: [1.5, 1, 1.5], coreTags: ['空地', '待售', '宁静'] },
  { name: '繁华城市', center: [0, -ENV_SPACING], modelName: 'trainer', color: 0x555566, size: [2, 2, 2], coreTags: ['城市', '繁华', '钢铁', '喧嚣'] },
  { name: '农村池塘', center: [ENV_SPACING, -ENV_SPACING], modelName: 'pond', color: 0x4488aa, size: [2, 0.5, 2], coreTags: ['池塘', '农村', '水边', '宁静'] },
  // row 1 (z = 0)
  { name: '暗黑森林', center: [-ENV_SPACING, 0], modelName: 'forest', color: 0x1a0a2e, size: [2, 1.5, 2], coreTags: ['暗黑', '森林', '神秘', '危险'] },
  { name: '玛扣大森林', center: [0, 0], modelName: 'tree_marko', color: 0x2d5a1e, size: [2, 1, 2], coreTags: ['森林', '古老', '守护', '自然', '沉稳'] },
  { name: '田园牧场', center: [ENV_SPACING, 0], modelName: 'grassland', color: 0x88bb44, size: [2, 1, 2], coreTags: ['田园', '麦田', '河流', '丰收'] },
  // row 2 (z = ENV_SPACING)
  { name: '危险区域', center: [-ENV_SPACING, ENV_SPACING], modelName: 'sun_stone', color: 0xaa3311, size: [2, 1, 2], coreTags: ['岩浆', '危险', '火山', '怪物'] },
  { name: '另一片森林', center: [0, ENV_SPACING], modelName: 'forest', color: 0x2d5a1e, size: [2, 1, 2], coreTags: ['森林', '生机', '清新', '绿意'] },
  { name: '干旱沙地', center: [ENV_SPACING, ENV_SPACING], modelName: 'grassland', color: 0xccaa66, size: [1.5, 0.8, 1.5], coreTags: ['沙漠', '干旱', '荒芜', '炎热'] },
];

// Layouts for the 8 peripheral environments (index 0..8, 4 is center/null)
export const envLayouts = [
  // 0: 待售空地
  { trees: [{grid:[2,2],name:'枯木A',id:'tree_rand_1',tags:['枯树','荒凉']},{grid:[7,2],name:'枯木B',id:'tree_rand_2',tags:['枯树','荒凉']},{grid:[2,7],name:'枯木C',id:'tree_rand_3',tags:['枯树','荒凉']}], houses: [{grid:[6,6],name:'空地小屋',id:'pet_house',tags:['待售','简陋']}], decors: [{grid:[1,8],name:'苔藓灯',id:'moss_lamp',tags:['照明','自然']},{grid:[8,1],name:'风铃',id:'wind_chime',tags:['声音','轻盈']}] },
  // 1: 繁华城市
  { trees: [{grid:[1,1],name:'行道树A',id:'tree_rand_4',tags:['城市','绿化']},{grid:[8,1],name:'行道树B',id:'tree_rand_5',tags:['城市','绿化']},{grid:[1,8],name:'行道树C',id:'tree_rand_6',tags:['城市','绿化']}], houses: [{grid:[3,6],name:'公寓A',id:'pet_house',tags:['住宅','高层']},{grid:[6,3],name:'公寓B',id:'pet_house',tags:['住宅','高层']}], decors: [{grid:[2,2],name:'街机',id:'ps5_console',tags:['科技','娱乐']},{grid:[7,7],name:'便携游戏机',id:'ns2_console',tags:['科技','便携']},{grid:[8,8],name:'都市雕像',id:'thunder_snow',tags:['艺术','现代']}] },
  // 2: 农村池塘
  { trees: [{grid:[2,3],name:'垂柳A',id:'tree_yafo',tags:['柳树','水边']},{grid:[7,3],name:'垂柳B',id:'tree_witch',tags:['柳树','水边']},{grid:[3,7],name:'水边树',id:'tree_rand_1',tags:['水生','清新']}], houses: [{grid:[6,6],name:'农舍A',id:'pet_house',tags:['农村','温馨']},{grid:[7,7],name:'农舍B',id:'pet_house',tags:['农村','温馨']}], decors: [{grid:[1,1],name:'池塘风铃',id:'wind_chime',tags:['声音','田园']},{grid:[8,8],name:'水草灯',id:'moss_lamp',tags:['照明','自然']}] },
  // 3: 暗黑森林
  { trees: [{grid:[1,1],name:'暗黑树A',id:'tree_witch',tags:['暗黑','魔法']},{grid:[8,1],name:'暗黑树B',id:'tree_rand_2',tags:['暗黑','扭曲']},{grid:[1,8],name:'暗黑树C',id:'tree_rand_3',tags:['暗黑','扭曲']},{grid:[8,8],name:'暗黑树D',id:'tree_rand_4',tags:['暗黑','扭曲']}], houses: [{grid:[3,5],name:'暗木屋A',id:'pet_house',tags:['暗黑','神秘']},{grid:[5,3],name:'暗木屋B',id:'pet_house',tags:['暗黑','神秘']}], decors: [{grid:[2,7],name:'太阳石',id:'sun_stone',tags:['神秘','古老']},{grid:[7,2],name:'训练桩',id:'trainer',tags:['战斗','训练']},{grid:[6,6],name:'雷电绒',id:'thunder_snow',tags:['雷电','力量']}] },
  // 4: 玛扣大森林 (center) — handled separately
  null,
  // 5: 田园牧场
  { trees: [{grid:[2,2],name:'果树A',id:'tree_yafo',tags:['果树','丰收']},{grid:[7,2],name:'果树B',id:'tree_goldfish',tags:['果树','金黄']},{grid:[2,7],name:'果树C',id:'tree_rand_5',tags:['果树','甜美']}], houses: [{grid:[6,6],name:'田园小屋A',id:'pet_house',tags:['农村','温馨']},{grid:[7,7],name:'田园小屋B',id:'pet_house',tags:['农村','温馨']}], decors: [{grid:[1,8],name:'牧场风铃',id:'wind_chime',tags:['声音','田园']},{grid:[8,1],name:'牧场灯',id:'moss_lamp',tags:['照明','自然']},{grid:[3,3],name:'太阳石',id:'sun_stone',tags:['光明','温暖']}] },
  // 6: 危险区域
  { trees: [{grid:[2,2],name:'焦炭树',id:'tree_witch',tags:['烧焦','死亡']},{grid:[7,7],name:'枯骨树',id:'tree_rand_6',tags:['枯骨','危险']}], houses: [{grid:[5,3],name:'避难所',id:'pet_house',tags:['避难','坚固']}], decors: [{grid:[1,8],name:'训练桩',id:'trainer',tags:['战斗','训练']},{grid:[8,1],name:'雷电绒',id:'thunder_snow',tags:['雷电','力量']},{grid:[3,7],name:'残骸',id:'ps5_console',tags:['废墟','科技']}] },
  // 7: 另一片森林
  { trees: [{grid:[1,1],name:'森林树A',id:'tree_rand_1',tags:['森林','生机']},{grid:[8,1],name:'森林树B',id:'tree_rand_2',tags:['森林','生机']},{grid:[1,8],name:'森林树C',id:'tree_rand_3',tags:['森林','生机']},{grid:[8,8],name:'森林树D',id:'tree_rand_4',tags:['森林','生机']}], houses: [{grid:[3,6],name:'林中小屋A',id:'pet_house',tags:['森林','温馨']},{grid:[6,3],name:'林中小屋B',id:'pet_house',tags:['森林','温馨']}], decors: [{grid:[2,2],name:'森林灯',id:'moss_lamp',tags:['照明','自然']},{grid:[7,7],name:'森林风铃',id:'wind_chime',tags:['声音','轻盈']}] },
  // 8: 干旱沙地
  { trees: [{grid:[2,2],name:'沙地树A',id:'tree_rand_5',tags:['耐旱','坚韧']},{grid:[7,7],name:'沙地树B',id:'tree_rand_6',tags:['耐旱','坚韧']}], houses: [{grid:[4,6],name:'沙漠帐篷',id:'pet_house',tags:['沙漠','临时']}], decors: [{grid:[1,8],name:'遗迹桩',id:'trainer',tags:['遗迹','古老']},{grid:[8,1],name:'微光灯',id:'moss_lamp',tags:['遗迹','微光']}] },
];

// Center environment static entities
export const centerLayout = [
  { grid: [0, 0], name: 'ps5游戏机', tags: ['科技', '娱乐', '白色'], id: 'ps5_console', category: 'decor', areaType: 'decor', scale: 0.5 },
  { grid: [4, 3], name: 'ns2游戏机', tags: ['便携', '游戏', '彩色'], id: 'ns2_console', category: 'decor', areaType: 'decor', scale: 0.5 },
  { grid: [9, 9], name: '雷霆大雪绒', tags: ['毛绒', '可爱', '雷电'], id: 'thunder_snow', category: 'decor', areaType: 'decor', scale: 0.5 },
  { grid: [8, 0], name: '魔女', tags: ['神秘', '紫色', '魔法'], id: 'tree_witch', category: 'tree', areaType: 'tree', scale: 1 },
  { grid: [0, 8], name: 'yafo', tags: ['热带', '阳光', '棕榈'], id: 'tree_yafo', category: 'tree', areaType: 'tree', scale: 1 },
  { grid: [9, 5], name: '金鱼', tags: ['金色', '灵动', '水中影'], id: 'tree_goldfish', category: 'tree', areaType: 'tree', scale: 1 },
  { grid: [6, 0], name: '田园商店', tags: ['木造', '田园', '交易'], id: 'country_shop', category: 'house', areaType: 'pet', scale: 0.5 },
];

// Pet house configurations (center env only)
export const houseConfigs = [
  { grid: [1, 3], houseName: '马扣的家', petName: '马扣' },
  { grid: [7, 6], houseName: '扶摇的家', petName: '扶摇' },
  { grid: [2, 7], houseName: 'momo的家', petName: 'momo' },
];
