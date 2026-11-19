import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import { ResidentGroundMesh } from './ResidentGroundMesh.js';
import { TerrainPathfinder } from './TerrainPathfinder.js';

// Cache the static walk surface at one metre resolution. Floor/deck geometry
// supports a character; raised kerbs, railings, tree trunks and walls obstruct it.
export class ResidentWalkSurface {
  constructor(terrain, registry, map = null) {
    this.map = map;
    this.terrain = terrain;
    this.registry = registry;
  }

  get grid() {
    if (this.cached && this.revision === this.registry.revision) return this.cached;
    const t = this.terrain, divisions = 4, step = t.tileSize / divisions;
    const size = t.gridSize * divisions;
    const rows = Array.from({length:size}, (_,z) => Array.from({length:size}, (_,x) =>
      t.isWalkableCell({x:Math.floor(x/divisions), z:Math.floor(z/divisions)}) ? 'ground' : 'blocked'));
    const grid = new TerrainPathfinder({terrainLayout:rows, center:[t.centerX,t.centerZ], tileSize:step});
    this.ground = new ResidentGroundMesh(t, this.map);
    const clearance = 0.48 + step * 0.5; // capsule radius + skin + half a navigation cell
    const unit = new Vector3(1,1,1);
    for (const { entity, colliders } of this.registry.records.values()) {
      const spec = entity.mesh.userData?.collider;
      const bridge = spec?.type === 'bridge';
      const decks = bridge ? spec.deckSegments?.length || 1 : 0;
      for (const collider of colliders.slice(0,decks)) this.ground.addDeck(collider);
      for (const collider of colliders.slice(decks)) {
        const p = collider.translation(), q = collider.rotation();
        const shape = collider.shape;
        const h = shape.halfExtents || {x:shape.radius,y:shape.halfHeight,z:shape.radius};
        if (![h.x,h.y,h.z].every(Number.isFinite)) continue;
        const extents = new Vector3(h.x,h.y,h.z);
        const bounds = new Box3(extents.clone().negate(), extents).applyMatrix4(new Matrix4().compose(p,new Quaternion(q.x,q.y,q.z,q.w),unit));
        if (!bridge && !this.map && (bounds.min.y > 2 || bounds.max.y < 0.12)) continue;
        const a = grid.worldToCell({x:bounds.min.x-clearance,z:bounds.min.z-clearance});
        const b = grid.worldToCell({x:bounds.max.x+clearance,z:bounds.max.z+clearance});
        for(let z=Math.max(0,a.z);z<=Math.min(size-1,b.z);z++) for(let x=Math.max(0,a.x);x<=Math.min(size-1,b.x);x++) {
          const at=grid.cellToWorld({x,z});
          if (this.map && !bridge) {
            const y=this.ground.landHeight(at.x,at.z);
            if(y!=null && (bounds.min.y>y+2 || bounds.max.y<y+.12)) continue;
          }
          if(at.x>=bounds.min.x-clearance && at.x<=bounds.max.x+clearance && at.z>=bounds.min.z-clearance && at.z<=bounds.max.z+clearance) rows[z][x]='blocked';
        }
      }
    }
    for (let z=0;z<size;z++) for(let x=0;x<size;x++) {
      if(rows[z][x]!=='blocked' && this.ground.heightAt(grid.cellToWorld({x,z}))==null) rows[z][x]='blocked';
    }
    this.revision=this.registry.revision;
    return this.cached=grid;
  }

  groundHeightAt(point) {
    if (!this.cached || this.registry.revision !== this.revision) void this.grid;
    return this.ground.heightAt(point);
  }

  findPath(from,to) {
    if(this.groundHeightAt(from)==null || this.groundHeightAt(to)==null) return [];
    return this.grid.findPath(from,to).map(p=>({...p,y:this.groundHeightAt(p)}));
  }
  isWalkableWorld(point) { return this.grid.isWalkableWorld(point) && this.groundHeightAt(point)!=null; }
  isSegmentWalkable(from,to) { return this.grid.isSegmentWalkable(from,to); }
  cellKeyForWorld(point) { return this.grid.cellKeyForWorld(point); }
}
