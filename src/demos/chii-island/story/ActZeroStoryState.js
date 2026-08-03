import {
  ACT_ZERO_EVENT_ID,
  ISLAND_STORY_LEGACY_ACT_ZERO_STORAGE_KEY,
  ISLAND_STORY_STORAGE_KEY,
  IslandStoryState,
} from '../../../gameplay/story/IslandStoryState.js';

const MAX_WISH_LENGTH = 48;

export function sanitizeActZeroWish(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_WISH_LENGTH);
}

export class ActZeroStoryState {
  constructor({
    storyState = null,
    storage = globalThis.localStorage,
    now = () => Date.now(),
  } = {}) {
    this.storyState = storyState || new IslandStoryState({ storage, now });
  }

  getSnapshot() {
    const event = this.storyState.getEvent(ACT_ZERO_EVENT_ID);
    return {
      version: 1,
      act0: {
        status: event?.status || 'not_started',
        rescueWish: sanitizeActZeroWish(
          event?.data?.rescueWish || this.storyState.getFact('act0.rescueWish', ''),
        ),
        startedAt: event?.startedAt ?? null,
        completedAt: event?.completedAt ?? null,
      },
    };
  }

  shouldPlay(search = globalThis.location?.search || '') {
    const params = new URLSearchParams(search);
    if (params.get('act') === '0' || params.has('replay-act0')) return true;
    if (
      params.has('skip-intro')
      || params.has('church-town')
      || params.has('forest-temple')
    ) {
      return false;
    }
    return !this.storyState.hasCompletedEvent(ACT_ZERO_EVENT_ID);
  }

  start() {
    this.storyState.startEvent(ACT_ZERO_EVENT_ID);
    return this.getSnapshot();
  }

  recordWish(value) {
    this.storyState.updateEventData(ACT_ZERO_EVENT_ID, {
      rescueWish: sanitizeActZeroWish(value),
    });
    return this.getSnapshot();
  }

  complete() {
    this.storyState.completeEvent(ACT_ZERO_EVENT_ID);
    return this.getSnapshot();
  }

  reset() {
    this.storyState.resetEvent(ACT_ZERO_EVENT_ID);
    return this.getSnapshot();
  }
}

export const ACT_ZERO_STORY_STORAGE_KEY = ISLAND_STORY_STORAGE_KEY;
export const ACT_ZERO_LEGACY_STORY_STORAGE_KEY = ISLAND_STORY_LEGACY_ACT_ZERO_STORAGE_KEY;
export const ACT_ZERO_WISH_MAX_LENGTH = MAX_WISH_LENGTH;
