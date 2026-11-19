import { ArchitectNPC } from '../src/demos/chii-island/entities/ArchitectNPC.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ResidentWalkSurface } from '../src/world/navigation/ResidentWalkSurface.js';
import { TerrainPathfinder } from '../src/world/navigation/TerrainPathfinder.js';

const box = (x,y,z,hx,hy,hz) => ({translation:()=>({x,y,z}), rotation:()=>({x:0,y:0,z:0,w:1}),shape:{halfExtents:{x:hx,y:hy,z:hz}}});
const record = (colliders, collider) => ({entity:{mesh:{userData:{collider}}},colliders});

test('resident routes change when a wall is added across an existing route and reopen after removal', () => {
  const terrain = new TerrainPathfinder({terrainLayout:Array.from({length:8},()=>Array(8).fill('grass'))});
  const registry = {revision:0,records:new Map()};
  const nav = new ResidentWalkSurface(terrain,registry);
  const from={x:-10,z:0}, to={x:10,z:0};
  assert.equal(nav.findPath(from,to).length,1);
  registry.records.set('wall',record([box(0,1,0,0.7,1,5)])); registry.revision++;
  const route=nav.findPath(from,to);
  assert.ok(route.some(p=>Math.abs(p.z)>5));
  assert.ok(route.every((p,i)=>nav.isSegmentWalkable(i?route[i-1]:from,p)));
  assert.deepEqual(nav.findPath(from,{x:0,z:0}),[]);
  registry.records.clear(); registry.revision++;
  assert.equal(nav.findPath(from,to).length,1);
});

test('bridge paving supports a route but its side rails do not', () => {
  const terrain=new TerrainPathfinder({terrainLayout:Array.from({length:7},()=>Array.from({length:7},(_,x)=>x===3?'water':'grass')),traversalCells:['3,3']});
  const bridge=record([box(0,0,0,6,.2,2),box(0,2.5,2,6,.4,.3)],{type:'bridge',deckSegments:[{}]});
  const nav=new ResidentWalkSurface(terrain,{records:new Map([['bridge',bridge]]),revision:1});
  assert.equal(nav.findPath({x:-8,z:0},{x:8,z:0}).length,1);
  assert.equal(nav.isWalkableWorld({x:4,z:2}),false);
  assert.equal(nav.isWalkableWorld({x:0,z:8}),false);
});

test('a resident climbs and descends a tilted bridge face and does not retain its crest height at rest', () => {
  const terrain = new TerrainPathfinder({terrainLayout:Array.from({length:8},()=>Array(8).fill('grass'))});
  const ramp=box(0,1.45,0,5,.12,2);
  const angle=Math.atan(.3);
  ramp.rotation=()=>({x:0,y:0,z:Math.sin(angle/2),w:Math.cos(angle/2)});
  const nav=new ResidentWalkSurface(terrain,{revision:0,records:new Map([['ramp',record([ramp],{type:'bridge'})]])});
  const pet=new ArchitectNPC();
  pet.setNavigation(nav);
  pet.setPosition(4,7,0);
  pet.update(.05);
  assert.ok(Math.abs(pet.mesh.position.y-(1.45+1.2+.12/Math.cos(angle)+.03))<1e-5);
  pet.walkTo(-8,0,5);
  for (let i=0;i<80;i++) pet.update(.05);
  assert.ok(Math.abs(pet.mesh.position.x+8)<.21);
  assert.equal(pet.mesh.position.y,.03);
  pet.mesh.position.y=4.63;
  pet.update(.05);
  assert.equal(pet.mesh.position.y,.03);
});

test('height uses the Forge physics terrain triangles, not zero or a bilinear surface; unsupported water is rejected', () => {
  const terrain=new TerrainPathfinder({terrainLayout:[['grass','grass'],['water','grass']],center:[0,0],tileSize:2,traversalCells:['0,1']});
  const map={box:{size:[4,8,4]},terrain:{resolutionX:2,resolutionZ:2,heights:[2,2,2,4]}};
  const nav=new ResidentWalkSurface(terrain,{revision:0,records:new Map()},map);
  assert.equal(nav.groundHeightAt({x:-1,z:-1}),2);
  assert.equal(nav.groundHeightAt({x:1,z:1}),3);
  assert.equal(nav.groundHeightAt({x:-1,z:1}),null);
  assert.deepEqual(nav.findPath({x:-1,z:-1},{x:-1,z:1}),[]);
  assert.equal(nav.findPath({x:-1,z:-1},{x:1,z:1}).at(-1).y,3);
});
