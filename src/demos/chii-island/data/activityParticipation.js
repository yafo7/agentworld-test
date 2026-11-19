import { editableThemeActions } from './residentThemes.js';
import { programAssignment } from './festivalProgram.js';

export function themeForActivity(type) {
  if (type === 'morning_exercise') return 'exercise';
  if (type === 'greeting') return 'chat';
  return ['apple_pick', 'custom_daily'].includes(type) ? 'outing' : 'festival';
}

// Bind a saved event plan to this run's residents. Only the event-specific
// action is eligible for reuse in the activity registry on the next run.
export function assignActivityResident(plan, id, theme) {
  if (plan.festivalProgram) return programAssignment(plan.festivalProgram, id);
  const themeId = themeForActivity(plan.type);
  const host = id === plan.hostId;
  const guest = plan.type === 'birthday' && id === plan.subjectId;
  let role = host ? 'initiator' : 'participant';
  if (themeId === 'festival') role = guest ? 'guest' : host ? 'host' : theme?.role || 'participant';
  if (themeId === 'exercise') role = host ? 'lead' : 'participant';
  const authored = { kind: 'program', name: plan.actionPrompts?.[id] || '参加活动' };
  const gestures = theme ? editableThemeActions(theme) : [];
  let actions;
  if (theme && !guest && (themeId === 'exercise' || plan.type === 'campfire' || onActivityPerimeter(role))) {
    actions = gestures;
  } else {
    actions = theme?.edited ? [authored, ...gestures] : [authored];
  }
  return { themeId, role, actions: actions.length ? actions : [authored] };
}

export function onActivityPerimeter(role) {
  return role === 'helper' || role === 'spectator';
}

export function describeActivityStep(activity, id, current) {
  const { plan, status } = activity;
  switch (status) {
    case 'preparing': return '等待开场';
    case 'gathering': return '前往分配的站位';
    case 'new_year_dance_gathering': return '前往围火站位';
    case 'new_year_feast_gathering': return '前往年夜饭桌';
    case 'costume_change': return plan.type === 'new_year' || id === plan.subjectId ? '换上节日服装' : '等待寿星入场';
    case 'birthday_intro': return id === plan.hostId ? '推蛋糕桌' : id === plan.subjectId ? '迎接生日蛋糕' : '看蛋糕入场';
    case 'new_year_greetings': return activity.greetedPetIds?.has(id) ? '已经向玩家拜年' : '等候与玩家拜年';
    case 'new_year_feast_setup': return id === plan.hostId ? '摆放年夜饭桌' : '等候开席';
    case 'new_year_feast': return '享用团圆饭';
    case 'prop_exit':
    case 'wind_down': return '活动收尾';
    default: return current?.name || plan.actionPrompts?.[id] || '参加活动';
  }
}
