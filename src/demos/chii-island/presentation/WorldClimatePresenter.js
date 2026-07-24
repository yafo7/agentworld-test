import { toClimatePresentationState } from '../../../world/climate/WorldClimateState.js';
import {
  ManualClimateController,
  resolveClimateAppearance,
} from './ManualClimateController.js';

/**
 * Environment-only climate presentation. State sources, persistence, permissions,
 * weather providers, and DOM controls belong to WorldClimateSystem.
 */
export class WorldClimatePresenter extends ManualClimateController {
  constructor(options = {}) {
    super({ ...options, storage: null, bindControls: false });
  }

  setClimateState(state) {
    return this.setState(toClimatePresentationState(state));
  }

  getCapabilities() {
    return {
      source: 'chii-world-climate-presenter',
      timeOfDay: true,
      seasons: true,
      weatherParticles: true,
      fog: true,
      lights: true,
      sky: this.skyVisual?.getCapabilities?.() || { source: 'scene-background-color' },
    };
  }
}

export { resolveClimateAppearance };
