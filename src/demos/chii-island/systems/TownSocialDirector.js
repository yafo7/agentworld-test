import { getPetStateMachine } from '../../../gameplay/pets/PetStateMachine.js';
import { TownSocialMemory } from '../../../gameplay/social/TownSocialMemory.js';
import { listTownActivityDefinitions } from '../data/townSocialActivities.js';

function normalizedPetId(pet) {
  const id = String(pet?._petName || pet?._petId || pet?.mesh?.name || '').trim();
  return id === 'fangke' ? 'fangk' : id;
}

function profileTags(pet) {
  const profile = pet?._profile || {};
  return new Set([
    ...(profile.personalityTags || []),
    ...(profile.featureTags || []),
    ...(profile.favoriteActions || []),
    ...(profile.preferredObjects || []),
  ]);
}

export class TownSocialDirector {
  constructor({ participants, worldObjects, memory = new TownSocialMemory(), definitions = null }) {
    this.participants = participants;
    this.worldObjects = worldObjects;
    this.memory = memory;
    this.definitions = definitions || listTownActivityDefinitions();
  }

  getOpportunity(pet) {
    if (!pet || getPetStateMachine(pet).isBusy()) return null;
    const id = normalizedPetId(pet);
    const tags = profileTags(pet);
    const candidates = this.definitions
      .filter(definition => definition.initiatorId === id)
      .filter(definition => this._hasRequiredContext(definition))
      .map(definition => ({
        definition,
        completed: this.memory.completedCount(definition.type),
        lastSequence: this.memory.lastSequence(definition.type),
        personalityMatches: (definition.opportunity.preferredProfileTags || [])
          .filter(tag => tags.has(tag)).length,
      }));

    candidates.sort((a, b) => (
      a.completed - b.completed
      || a.lastSequence - b.lastSequence
      || b.personalityMatches - a.personalityMatches
      || b.definition.opportunity.priority - a.definition.opportunity.priority
    ));
    const selected = candidates[0]?.definition;
    if (!selected) return null;
    return {
      type: selected.type,
      definition: selected,
      label: selected.opportunity.label,
      proposal: selected.opportunity.proposal,
      acceptLabel: selected.opportunity.acceptLabel,
    };
  }

  getFeatured(playerPosition, range = 12) {
    let featured = null;
    let bestDistance = range;
    for (const pet of this.participants) {
      const opportunity = this.getOpportunity(pet);
      if (!opportunity) continue;
      const position = pet.getPosition?.() || pet.mesh?.position;
      if (!position) continue;
      const distance = Math.hypot(position.x - playerPosition.x, position.z - playerPosition.z);
      if (distance <= bestDistance) {
        bestDistance = distance;
        featured = { pet, opportunity, distance };
      }
    }
    return featured;
  }

  participantsFor(definition) {
    if (definition.participantMode === 'all') return [...this.participants];
    const ids = new Set(definition.defaultParticipantIds || [definition.initiatorId]);
    return this.participants.filter(pet => ids.has(normalizedPetId(pet)));
  }

  targetsFor(definition) {
    const tags = definition.targetObjectTags || [];
    return tags.flatMap(tag => this.worldObjects.query(entity => entity.tags?.includes(tag)).slice(0, 1));
  }

  _hasRequiredContext(definition) {
    const availableIds = new Set(this.participants.map(normalizedPetId));
    const requiredPets = definition.participantMode === 'listed'
      ? definition.defaultParticipantIds || []
      : [definition.initiatorId];
    if (requiredPets.some(id => !availableIds.has(id))) return false;
    return (definition.targetObjectTags || []).every(tag => (
      this.worldObjects.query(entity => entity.tags?.includes(tag)).length > 0
    ));
  }
}

export { normalizedPetId as townPetId };
