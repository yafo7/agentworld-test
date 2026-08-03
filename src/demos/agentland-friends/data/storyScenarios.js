export const AGENTLAND_FRIEND_STORIES = Object.freeze([
  Object.freeze({
    id: 'picnic-direction',
    title: '野餐毯到底朝哪边',
    location: Object.freeze([0, 0, 2]),
    participants: Object.freeze(['lolo_sample', 'naitang_sample', 'fangke_sample']),
    slots: Object.freeze([
      Object.freeze([-2.8, 0, 2.4]),
      Object.freeze([0, 0, 4.2]),
      Object.freeze([2.8, 0, 2.4]),
    ]),
    invitation: Object.freeze({
      speakerId: 'fangke_sample',
      text: '集合一下！今天要解决一个很严肃的问题：野餐毯朝哪边。',
    }),
    beats: Object.freeze([
      Object.freeze({
        at: 0.2,
        speakerId: 'lolo_sample',
        animation: 'special',
        text: '朝有花的方向吧，点心看起来会更有艺术修养。',
      }),
      Object.freeze({
        at: 3.2,
        speakerId: 'naitang_sample',
        animation: 'special',
        text: '我只关心点心朝我，这个方向最不容易迷路。',
      }),
      Object.freeze({
        at: 6.2,
        speakerId: 'fangke_sample',
        animation: 'special',
        text: '很好，会议有结论了：毯子不动，我们围着它转。',
      }),
    ]),
    duration: 10.2,
    closing: '大家郑重地转了半圈，野餐因此取得圆满成功。',
  }),
]);

export function getAgentlandFriendStory(id) {
  return AGENTLAND_FRIEND_STORIES.find(story => story.id === id) || null;
}
