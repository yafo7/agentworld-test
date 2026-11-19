import { residentRoutine } from '../src/demos/chii-island/data/residentRoutines.js';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CHARACTER_SHOWCASE_PATH,
  createCharacterShowcaseCatalog,
  getShowcaseAnimationLabel,
} from '../src/demos/chii-island/data/characterShowcaseCatalog.js';
import { createAnimalAgentShowcaseProjection } from '../src/demos/chii-island/data/animalAgentShowcase.js';

const projectRoot = new URL('../', import.meta.url);
const publicRoot = new URL('../public/', import.meta.url);
const manifest = JSON.parse(readFileSync(
  new URL('generated/player-candidates/phrolova/manifest.json', publicRoot),
  'utf8',
));
const catalog = createCharacterShowcaseCatalog(manifest);

test('character showcase classifies the full current Chii cast', () => {
  assert.equal(CHARACTER_SHOWCASE_PATH, './player-candidates.html');
  assert.deepEqual(
    catalog.categories.map(category => category.id),
    ['players', 'residents', 'specialists'],
  );
  assert.deepEqual(
    catalog.categories.map(category => category.characters.length),
    [2, 5, 2],
  );

  const ids = catalog.categories.flatMap(category => (
    category.characters.map(character => character.id)
  ));
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, [
    'phrolova',
    'nailong',
    'momo',
    'yafo',
    'mok',
    'mako',
    'lingq',
    'fangk',
    'builder_crab',
  ]);
});

test('every showcased character uses existing local model and animation assets', () => {
  for (const category of catalog.categories) {
    for (const character of category.characters) {
      assert.ok(character.name, `${character.id} has no display name`);
      assert.ok(character.group, `${character.id} has no subgroup`);
      assert.ok(character.role, `${character.id} has no role`);
      assert.ok(character.animations.idle, `${character.id} has no idle animation`);
      assert.ok(
        existsSync(new URL(character.model, publicRoot)),
        `${character.id} model is missing: ${character.model}`,
      );
      for (const [name, path] of Object.entries(character.animations)) {
        assert.ok(getShowcaseAnimationLabel(name));
        assert.ok(
          existsSync(new URL(path, publicRoot)),
          `${character.id}:${name} is missing: ${path}`,
        );
      }
      for (const variant of character.variants || []) {
        assert.ok(
          existsSync(new URL(variant.model, publicRoot)),
          `${character.id}:${variant.id} model is missing: ${variant.model}`,
        );
        for (const [name, path] of Object.entries(variant.animations)) {
          assert.ok(getShowcaseAnimationLabel(name));
          assert.ok(
            existsSync(new URL(path, publicRoot)),
            `${character.id}:${variant.id}:${name} is missing: ${path}`,
          );
        }
      }
    }
  }
});

test('every curated resident exposes independent Pro, Voxel, and Original models', () => {
  const residents = catalog.categories
    .filter(category => ['residents', 'specialists'].includes(category.id))
    .flatMap(category => category.characters);

  for (const character of residents) {
    assert.deepEqual(
      character.variants.map(variant => variant.id),
      ['voxel-20261118', 'original', 'pro', 'voxel'],
      `${character.id} does not expose all four versions`,
    );
    for (const variant of character.variants) {
      assert.ok(variant.group, `${character.id}:${variant.id} has no group label`);
      assert.ok(variant.name, `${character.id}:${variant.id} has no display name`);
    }
    assert.equal(
      new Set(character.variants.map(variant => variant.model)).size,
      4,
      `${character.id} variants share a runtime model path`,
    );
  }
});

test('each default resident has a GPT model and a complete rig for its routine and other motions', () => {
  for (const category of catalog.categories.filter(c => c.id !== 'players')) {
    for (const character of category.characters) {
      const model = JSON.parse(readFileSync(new URL(character.model, publicRoot), 'utf8'));
      assert.equal(model._meta.ai.provider, 'gpt', character.id);
      const joints = new Set(model.nodes.map(n => n.id));
      for (const path of Object.values(character.animations)) {
        const plan = JSON.parse(readFileSync(new URL(path, publicRoot), 'utf8'));
        for (const key of Object.keys(plan).filter(k => !k.startsWith('_'))) assert.ok(joints.has(key), path + ' ' + key);
      }
      const graph = residentRoutine(character.id, Object.keys(character.animations)).graph;
      assert.equal(graph.states.length, 3);
      assert.ok(graph.states.every(state => state.kind === 'stroll' || character.animations[state.animation]));
    }
  }
});

test('character showcase page exposes category, selection and animation surfaces', () => {
  const html = readFileSync(
    new URL('src/demos/chii-island/player-candidates.html', projectRoot),
    'utf8',
  );
  const script = readFileSync(
    new URL('src/demos/chii-island/player-candidates.js', projectRoot),
    'utf8',
  );

  assert.match(html, /id="category-tabs"/);
  assert.match(html, /id="character-strip"/);
  assert.match(html, /id="motion-switcher"/);
  assert.match(html, /id="variant-switcher"/);
  assert.match(html, /id="showcase-outfit-switcher"/);
  assert.match(html, /id="showcase-clothing-slots"/);
  assert.match(html, /id="showcase-prop-switcher"/);
  assert.match(html, /id="showcase-hand-switcher"/);
  assert.match(html, /id="overview-button"/);
  assert.match(html, /id="agent-details-button"/);
  assert.match(html, /id="agent-details-dialog"/);
  assert.match(html, /id="agent-details-content"/);
  assert.match(html, /id="chii-page-loader"/);
  assert.match(html, /data-chii-navigation/);
  assert.match(script, /raycaster\.intersectObjects/);
  assert.match(script, /createChiiPageLoadingScreen/);
  assert.match(script, /pageLoading\.show/);
  assert.match(script, /window\.__chiiCharacterShowcase/);
  assert.match(script, /CharacterAppearanceStore/);
  assert.match(script, /createAnimalAgentShowcaseProjection/);
});

test('resident showcase projects stable Agent identity and saved life without inventing memories', () => {
  const momo = catalog.categories.flatMap(category => category.characters).find(character => character.id === 'momo');
  const initial = createAnimalAgentShowcaseProjection(momo);
  assert.equal(initial.residentId, 'momo');
  assert.equal(initial.hasSavedLife, false);
  assert.equal(initial.memory.episodicCount, 0);
  assert.ok(initial.actions.some(action => action.id === 'routine.wander'));
  assert.equal(initial.architecture.length, 6);

  const saved = createAnimalAgentShowcaseProjection(momo, {
    state: { mood: { label: '期待' }, cognition: { dailyCalls: 2, dailyCallBudget: 6 } },
    memory: {
      episodic: [{ id: 'memory-1', at: 10, summary: '和 yafo 一起看花', outcome: 'completed' }],
      relationships: { yafo: { familiarity: 0.4, trust: 0.2 } },
    },
  });
  assert.equal(saved.hasSavedLife, true);
  assert.equal(saved.runtime.mood, '期待');
  assert.equal(saved.memory.recent[0].summary, '和 yafo 一起看花');
  assert.equal(saved.memory.relationships[0].name, 'yafo');
});

test('player characters do not receive a resident Agent panel', () => {
  const phrolova = catalog.categories[0].characters.find(character => character.id === 'phrolova');
  assert.equal(createAnimalAgentShowcaseProjection(phrolova), null);
});
