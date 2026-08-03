import { createPresetTownActivity } from './townSocialActivities.js';
import {
  TOWN_ACTIVITY_ANIMATION_SPECS,
  TOWN_ACTIVITY_MODEL_SPECS,
  activityAnimationPath,
  activityMountPath,
} from './townActivityAssetSpecs.js';

const ORIGINAL_ONLY = Object.freeze({ sceneStyles: ['original'] });

function residentAnimation(name, subjectId) {
  return { kind: 'resident_animation', name, subjectId, ...ORIGINAL_ONLY };
}

function fileAnimation(spec, subjectId = spec.subjectId) {
  return {
    kind: 'file_animation',
    path: activityAnimationPath(spec.id),
    key: `activity_${spec.id}`,
    subjectId,
    ...ORIGINAL_ONLY,
  };
}

function fileModel(spec) {
  return {
    kind: 'file_model',
    path: spec.path,
    assetId: spec.id,
    sizeProfile: spec.sizeProfile,
    footprint: spec.footprint,
    ...ORIGINAL_ONLY,
  };
}

function generatedModel(assetId, path, sizeProfile, footprint) {
  return { kind: 'file_model', assetId, path, sizeProfile, footprint, ...ORIGINAL_ONLY };
}

function registered(type, participants, patch = {}) {
  const plan = createPresetTownActivity(type, {
    initiatorId: type === 'apple_pick' ? 'mako' : type === 'greeting' ? 'lingq' : 'fangk',
    participantIds: participants,
    subjectId: type === 'birthday' ? 'mako' : null,
    targetObjectIds: [],
  });
  plan.id = `registered_${type}`;
  return {
    id: `town.${plan.scale}.${type}.v1`,
    revision: 1,
    status: 'ready',
    origin: 'curated',
    sceneStyle: 'original',
    type,
    title: plan.title,
    semanticTags: [type, plan.scale, 'church_town'],
    plan,
    compatibility: ORIGINAL_ONLY,
    provenance: { source: 'chii-town-activity-library', promptProfile: 'chii-v1' },
    stats: { runs: 0, failures: 0, lastResult: null },
    ...patch,
  };
}

const danceBindings = ids => Object.fromEntries(ids.map(id => [id, {
  main: residentAnimation('dance', id),
}]));

export function createTownActivityRegistrySeed() {
  return [
    registered('campfire', ['fangk', 'lingq', 'mako'], {
      layout: { formation: 'ring', ringRadius: 7.2, focus: 'campfire' },
      assets: {
        animations: danceBindings(['fangk', 'lingq', 'mako']),
        vfx: [{ id: 'warm-firelight', preset: 'celebration', ...ORIGINAL_ONLY }],
      },
      execution: { entry: 'fangk_dialogue', exit: 'initiator_dialogue', manualEnd: true },
      task: { kind: 'reach_location', label: '到篝火旁找个暖和的位置' },
      camera: { gathering: 'group_wide', performing: 'action_fullbody', ending: 'host_medium' },
    }),
    registered('apple_pick', ['mako'], {
      layout: { formation: 'target_side', sideClearance: 1.3, propOffset: [3.2, 0, 0], focus: 'apple_tree' },
      assets: {
        models: {
          picked_apple: generatedModel('gen_mrq6fxgp_a39u', 'generated/models/gen_mrq6fxgp_a39u.json', 'event_food', { width: 1, depth: 1 }),
        },
        animations: { mako: { main: fileAnimation(TOWN_ACTIVITY_ANIMATION_SPECS.makoPickApple, 'mako') } },
        vfx: [{ id: 'apple-pop', preset: 'celebration', ...ORIGINAL_ONLY }],
      },
      execution: { entry: 'mako_dialogue', exit: 'initiator_dialogue', manualEnd: true },
      task: { kind: 'reach_location', label: '陪 mako 去看看那棵苹果树' },
      camera: { gathering: 'target_wide', performing: 'action_fullbody', ending: 'host_medium' },
    }),
    registered('greeting', ['lingq', 'mako'], {
      layout: { formation: 'facing_pair', offsets: [[-2.2, 0, 0], [2.2, 0, 0]], focus: 'church_square' },
      assets: {
        animations: {
          lingq: { main: fileAnimation(TOWN_ACTIVITY_ANIMATION_SPECS.lingqGreeting, 'lingq') },
          mako: { main: fileAnimation(TOWN_ACTIVITY_ANIMATION_SPECS.makoGreetingReply, 'mako') },
        },
        vfx: [{ id: 'greeting-spark', preset: 'idea', ...ORIGINAL_ONLY }],
      },
      execution: { entry: 'lingq_dialogue', exit: 'initiator_dialogue', manualEnd: true },
      task: { kind: 'reach_location', label: '站到旁边看看 lingq 的新招呼' },
      camera: { gathering: 'pair_wide', performing: 'action_fullbody', ending: 'host_medium' },
    }),
    registered('party', ['fangk', 'lingq', 'mako', 'crab'], {
      layout: { formation: 'ring', ringRadius: 7.2, focus: 'campfire' },
      assets: {
        animations: danceBindings(['fangk', 'lingq', 'mako', 'crab']),
        vfx: [{ id: 'party-sparkles', preset: 'celebration', ...ORIGINAL_ONLY }],
      },
      execution: { entry: 'fangk_dialogue', exit: 'fangk_dialogue', manualEnd: true },
      task: { kind: 'invite_participants', label: '去和大家说一声，篝火边见' },
      camera: { gathering: 'group_wide', performing: 'action_fullbody', ending: 'host_medium' },
    }),
    registered('birthday', ['fangk', 'lingq', 'mako', 'crab'], {
      layout: { formation: 'ring', ringRadius: 5.8, organizerTableOffset: [0, 0, 7.8], focus: 'birthday_table' },
      assets: {
        models: {
          birthday_table: generatedModel('gen_ms2vp4o8_kscm', 'generated/models/gen_ms2vp4o8_kscm.json', 'event_table', { width: 3, depth: 2 }),
        },
        animations: {
          ...danceBindings(['fangk', 'lingq', 'mako', 'crab']),
          fangk: {
            ...danceBindings(['fangk']).fangk,
            intro: fileAnimation(TOWN_ACTIVITY_ANIMATION_SPECS.fangkPushTable, 'fangk'),
          },
          mako: {
            ...danceBindings(['mako']).mako,
            costume: fileAnimation(TOWN_ACTIVITY_ANIMATION_SPECS.makoOutfitTurn, 'mako'),
          },
        },
        outfits: { mako: { kind: 'equipment_loadout', outfitId: 'birthday', subjectId: 'mako', ...ORIGINAL_ONLY } },
        vfx: [{ id: 'birthday-reveal', preset: 'celebration', ...ORIGINAL_ONLY }],
      },
      execution: { entry: 'fangk_dialogue', exit: 'fangk_dialogue', manualEnd: true },
      task: { kind: 'invite_participants', label: '悄悄叫大家来给 mako 过生日' },
      camera: { gathering: 'group_wide', reveal: 'prop_closeup', performing: 'action_fullbody', ending: 'host_medium' },
    }),
    registered('new_year', ['fangk', 'lingq', 'mako', 'crab'], {
      layout: { formation: 'ring_and_feast', ringRadius: 8.2, tableSpacing: 6, focus: 'church_square' },
      assets: {
        models: {
          firecracker: fileModel(TOWN_ACTIVITY_MODEL_SPECS.newYearFirecracker),
          new_year_table_1: fileModel(TOWN_ACTIVITY_MODEL_SPECS.newYearTable),
          new_year_table_2: fileModel(TOWN_ACTIVITY_MODEL_SPECS.newYearTable),
          new_year_table_3: fileModel(TOWN_ACTIVITY_MODEL_SPECS.newYearTable),
          new_year_food_1: fileModel(TOWN_ACTIVITY_MODEL_SPECS.newYearFoodFish),
          new_year_food_2: fileModel(TOWN_ACTIVITY_MODEL_SPECS.newYearFoodChicken),
          new_year_food_3: fileModel(TOWN_ACTIVITY_MODEL_SPECS.newYearFoodFruit),
        },
        animations: {
          fangk: { main: residentAnimation('dance', 'fangk'), costume: fileAnimation(TOWN_ACTIVITY_ANIMATION_SPECS.fangkOutfitTurn), feast: fileAnimation(TOWN_ACTIVITY_ANIMATION_SPECS.fangkEat) },
          lingq: { main: residentAnimation('dance', 'lingq'), costume: fileAnimation(TOWN_ACTIVITY_ANIMATION_SPECS.lingqOutfitTurn), feast: fileAnimation(TOWN_ACTIVITY_ANIMATION_SPECS.lingqEat) },
          mako: { main: residentAnimation('dance', 'mako'), costume: fileAnimation(TOWN_ACTIVITY_ANIMATION_SPECS.makoOutfitTurn), feast: fileAnimation(TOWN_ACTIVITY_ANIMATION_SPECS.makoEat) },
          crab: { main: residentAnimation('dance', 'crab'), costume: fileAnimation(TOWN_ACTIVITY_ANIMATION_SPECS.crabOutfitTurn), feast: fileAnimation(TOWN_ACTIVITY_ANIMATION_SPECS.crabEat) },
          firecracker: { main: fileAnimation(TOWN_ACTIVITY_ANIMATION_SPECS.firecrackerSpark, null) },
        },
        outfits: Object.fromEntries(['fangk', 'lingq', 'mako', 'crab'].map(id => [id, {
          kind: 'equipment_loadout', outfitId: 'new-year', subjectId: id, ...ORIGINAL_ONLY,
        }])),
        mounts: {
          apple_tree: { kind: 'file_model', path: activityMountPath('new_year_apple_tree_lanterns'), assetId: 'new_year_apple_tree_lanterns', ...ORIGINAL_ONLY },
          church: { kind: 'file_model', path: activityMountPath('new_year_church_lanterns'), assetId: 'new_year_church_lanterns', ...ORIGINAL_ONLY },
        },
        vfx: [{ id: 'new-year-reveal', preset: 'celebration', ...ORIGINAL_ONLY }],
      },
      execution: { entry: 'fangk_dialogue', exit: 'fangk_dialogue', manualEnd: true },
      task: { kind: 'greet_participants', label: '和城镇里的每位朋友说一句新年好' },
      camera: { gathering: 'group_wide', costume: 'outfit_fullbody', reveal: 'prop_closeup', performing: 'action_fullbody', ending: 'host_medium' },
    }),
  ];
}

export const TOWN_ACTIVITY_REGISTRY_VERSION = 1;
