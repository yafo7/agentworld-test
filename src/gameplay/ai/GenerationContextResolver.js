export class GenerationContextResolver {
  constructor({ resolvers = [] } = {}) {
    this.resolvers = [...resolvers];
  }

  async resolve(intent, supplied = {}) {
    let context = { ...(intent.context || {}), ...(supplied || {}) };
    for (const resolver of this.resolvers) {
      const patch = await resolver(intent, Object.freeze({ ...context }));
      if (patch && typeof patch === 'object') context = { ...context, ...patch };
    }
    return Object.freeze(context);
  }
}
