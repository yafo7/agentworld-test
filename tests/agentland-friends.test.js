import assert from 'node:assert/strict';
import test from 'node:test';
import { AGENTLAND_FRIEND_STORIES } from '../src/demos/agentland-friends/data/storyScenarios.js';
import { FriendActivityDirector } from '../src/demos/agentland-friends/systems/FriendActivityDirector.js';

function makeActor(id) {
  return {
    id,
    autonomous: true,
    arrived: true,
    destinations: [],
    animations: [],
    setAutonomous(value) { this.autonomous = value; },
    stop() { this.arrived = true; this.animations.push('idle'); },
    moveTo(position) { this.arrived = false; this.destinations.push(position); },
    hasArrived() { return this.arrived; },
    play(name) { this.animations.push(name); },
  };
}

test('Agentland friend story runs invitation, gathering, performance and closing once', () => {
  const actors = AGENTLAND_FRIEND_STORIES[0].participants.map(makeActor);
  const stages = [];
  const lines = [];
  const completed = [];
  const director = new FriendActivityDirector({
    actors,
    stories: AGENTLAND_FRIEND_STORIES,
    onStage: stage => stages.push(stage),
    onLine: line => lines.push(line),
    onComplete: story => completed.push(story.id),
  });

  assert.equal(director.start('picnic-direction'), true);
  assert.equal(director.start('picnic-direction'), false);
  assert.equal(stages.at(-1).phase, 'invitation');
  assert.ok(actors.every(actor => actor.autonomous === false));

  director.update(2.6);
  assert.equal(stages.at(-1).phase, 'gathering');
  assert.ok(actors.every(actor => actor.destinations.length === 1));

  actors.forEach(actor => { actor.arrived = true; });
  director.update(0.1);
  assert.equal(stages.at(-1).phase, 'performing');

  director.update(10.3);
  assert.equal(stages.at(-1).phase, 'closing');
  assert.equal(lines.filter(line => !line.system).length, 4);
  assert.equal(lines.filter(line => line.system).length, 1);

  director.update(3.2);
  assert.equal(director.active, null);
  assert.deepEqual(completed, ['picnic-direction']);
  assert.ok(actors.every(actor => actor.autonomous === true));
  assert.equal(stages.at(-1).phase, 'idle');
});
