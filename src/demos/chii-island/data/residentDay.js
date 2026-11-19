// Island-clock periods. The night period crosses midnight.
const periods = [
  ['morning', '清晨', '06:00–10:00'],
  ['midday', '白天', '10:00–14:00'],
  ['afternoon', '午后', '14:00–18:00'],
  ['night', '夜晚', '18:00–06:00'],
];
export const dayPeriod = hour => hour < 6 || hour >= 18 ? 'night' : hour < 10 ? 'morning' : hour < 14 ? 'midday' : 'afternoon';

export function residentDay(id, legacy) {
  const walk = { kind: 'stroll', name: id === 'mako' ? '沿小路慢跑' : '出门散步', seconds: 15, ...(id === 'mako' ? { pace: 'run' } : {}) };
  const rest = { kind: 'wait', name: '安静歇息', seconds: 45 };
  const visit = { kind: 'visit', name: '寻找休息地点', seconds: 45 };
  const daytime = legacy.work || legacy.daily;
  const routines = [
    { name: id === 'mako' ? '晨跑' : '晨间活动', actions: [walk, ...legacy.daily.actions.filter(a => a.kind === 'perform').slice(0, 1)] },
    { ...daytime, name: legacy.work?.name || ({ momo: '照看花草', yafo: '舒展羽翼', mok: '练习出力', mako: '跨步练习', lingq: '排练舞步' }[id] || '日间活动') },
    { name: '树荫午休', place: 'shade', actions: [visit, rest] },
    { name: '晚间休息', actions: [{ ...rest, name: '停下来休息' }] },
  ];
  return Object.fromEntries(periods.map(([key, label, hours], index) => [key, {
    mode: 'sequence', ...routines[index], hours, when: label + ' · ' + hours,
    ...(key === 'midday' && legacy.work ? { place: 'building' } : {}),
  }]));
}

export const dayThemesOnly = themes => Object.fromEntries(periods.map(([key]) => [key, themes[key]]));
