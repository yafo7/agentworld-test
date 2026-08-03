import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const sourceRoot = resolve(repositoryRoot, 'src');
const toPosix = path => path.split(sep).join('/');
const sourcePath = path => toPosix(relative(repositoryRoot, path));

function javascriptFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) files.push(...javascriptFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(path);
  }
  return files.sort();
}

function resolveImport(importer, specifier) {
  if (!specifier.startsWith('.')) return null;
  const candidate = resolve(dirname(importer), specifier);
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  if (!extname(candidate) && existsSync(`${candidate}.js`)) return `${candidate}.js`;
  if (existsSync(candidate) && statSync(candidate).isDirectory()) {
    const index = resolve(candidate, 'index.js');
    if (existsSync(index)) return index;
  }
  return candidate;
}

function importsFor(file) {
  const source = readFileSync(file, 'utf8');
  const specifiers = [];
  const patterns = [
    /\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers.map(specifier => ({ specifier, target: resolveImport(file, specifier) }));
}

function layer(file) {
  return toPosix(relative(sourceRoot, file)).split('/')[0];
}

const files = javascriptFiles(sourceRoot);
const graph = new Map(files.map(file => [
  file,
  importsFor(file).filter(edge => edge.target && edge.target.startsWith(sourceRoot)),
]));

test('source imports resolve and obey shared-layer dependency boundaries', () => {
  const violations = [];
  for (const [file, edges] of graph) {
    const owner = layer(file);
    for (const edge of edges) {
      if (!existsSync(edge.target)) {
        violations.push(`${sourcePath(file)} -> missing ${edge.specifier}`);
        continue;
      }
      const dependency = layer(edge.target);
      if (owner === 'engine' && dependency !== 'engine') {
        violations.push(`${sourcePath(file)} -> ${sourcePath(edge.target)} (engine must be standalone)`);
      }
      if (owner === 'ports' && dependency !== 'ports') {
        violations.push(`${sourcePath(file)} -> ${sourcePath(edge.target)} (ports must be standalone)`);
      }
      if (['assets', 'backend', 'gameplay', 'integrations', 'storage', 'world'].includes(owner)
        && dependency === 'demos') {
        violations.push(`${sourcePath(file)} -> ${sourcePath(edge.target)} (shared layer imports demo)`);
      }
      if (owner === 'demos' && dependency === 'demos') {
        const ownerDemo = toPosix(relative(sourceRoot, file)).split('/')[1];
        const dependencyDemo = toPosix(relative(sourceRoot, edge.target)).split('/')[1];
        if (ownerDemo !== dependencyDemo) {
          violations.push(`${sourcePath(file)} -> ${sourcePath(edge.target)} (cross-demo import)`);
        }
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('runtime source graph has no import cycles', () => {
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const cycles = [];

  function visit(file) {
    if (visited.has(file)) return;
    if (visiting.has(file)) {
      const start = stack.indexOf(file);
      cycles.push([...stack.slice(start), file].map(sourcePath).join(' -> '));
      return;
    }
    visiting.add(file);
    stack.push(file);
    for (const { target } of graph.get(file) || []) visit(target);
    stack.pop();
    visiting.delete(file);
    visited.add(file);
  }

  for (const file of files) visit(file);
  assert.deepEqual(cycles, []);
});

test('current runtime has no accidental orphan modules', () => {
  const roots = [
    resolve(sourceRoot, 'demos/chii-island/main.js'),
    resolve(sourceRoot, 'demos/chii-island/player-candidates.js'),
    resolve(sourceRoot, 'demos/agentland-friends/main.js'),
  ];
  const reachable = new Set();
  function visit(file) {
    if (reachable.has(file)) return;
    reachable.add(file);
    for (const { target } of graph.get(file) || []) visit(target);
  }
  for (const root of roots) visit(root);

  const toolOnly = new Set([
    resolve(sourceRoot, 'demos/chii-island/story/storyDevelopmentBaseline.js'),
  ]);
  const orphaned = files
    .filter(file => !reachable.has(file) && !toolOnly.has(file))
    .map(sourcePath);
  assert.deepEqual(orphaned, []);
});

test('source tree contains no current legacy runtime', () => {
  assert.equal(existsSync(resolve(sourceRoot, 'legacy')), false);
});

test('composition root owns runtime providers and interaction sessions', () => {
  const main = readFileSync(resolve(sourceRoot, 'demos/chii-island/main.js'), 'utf8');
  const pastoral = readFileSync(resolve(sourceRoot, 'demos/chii-island/systems/pastoralSlice.js'), 'utf8');
  const forest = readFileSync(resolve(sourceRoot, 'demos/chii-island/systems/ForestTempleSystem.js'), 'utf8');
  const equipment = readFileSync(resolve(sourceRoot, 'gameplay/equipment/CharacterEquipmentService.js'), 'utf8');

  assert.match(main, /new EquipmentMountCache/);
  assert.match(main, /new ChiiInteractionSession/);
  assert.doesNotMatch(main, /let dialogueActive/);
  assert.doesNotMatch(main, /let activePetNpc/);
  assert.doesNotMatch(pastoral, /VoxelContentAdapter|GeneratedAssetRepository/);
  assert.doesNotMatch(forest, /VoxelContentAdapter|GeneratedAssetRepository/);
  assert.doesNotMatch(equipment, /EquipmentMountCache/);
});
