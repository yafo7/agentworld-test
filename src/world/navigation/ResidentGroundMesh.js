import { Quaternion, Vector3 } from 'three';

// Only load-bearing surfaces go into this mesh: terrain triangles and the
// upward faces of bridge paving. Rails, props and other agents never become floors.
export class ResidentGroundMesh {
  constructor(terrain, map = null) {
    this.terrain = terrain;
    this.map = map;
    this.faces = new Map();
  }

  addDeck(collider) {
    const half = collider.shape.halfExtents, p = collider.translation(), q = collider.rotation();
    const rotation = new Quaternion(q.x,q.y,q.z,q.w);
    for (let axis=0;axis<3;axis++) for (const sign of [-1,1]) {
      const normal = new Vector3().setComponent(axis,sign).applyQuaternion(rotation);
      if (normal.y < Math.SQRT1_2) continue;
      const corners = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>{
        const local=[0,0,0];
        local[axis]=sign; local[(axis+1)%3]=u; local[(axis+2)%3]=v;
        return new Vector3(...local).multiply(half).applyQuaternion(rotation).add(p);
      });
      for (const [a,b,c] of [[corners[0],corners[1],corners[2]],[corners[0],corners[2],corners[3]]]) {
        const min=this.terrain.worldToCell({x:Math.min(a.x,b.x,c.x)-.3,z:Math.min(a.z,b.z,c.z)-.3});
        const max=this.terrain.worldToCell({x:Math.max(a.x,b.x,c.x)+.3,z:Math.max(a.z,b.z,c.z)+.3});
        const face={a,b,c,normal};
        for(let z=min.z;z<=max.z;z++) for(let x=min.x;x<=max.x;x++) {
          const key=z*this.terrain.gridSize+x;
          if(!this.faces.has(key)) this.faces.set(key,[]);
          this.faces.get(key).push(face);
        }
      }
    }
  }

  landHeight(x,z) {
    if (!this.map) return 0;
    const [width,,depth]=this.map.box.size, {heights,resolutionX:n,resolutionZ:m}=this.map.terrain;
    const u=(x/width+.5)*(n-1), v=(z/depth+.5)*(m-1);
    if(u<0 || v<0 || u>n-1 || v>m-1) return null;
    const i=Math.min(n-2,Math.floor(u)), j=Math.min(m-2,Math.floor(v)), k=j*n+i;
    const dx=u-i,dz=v-j, a=heights[k], b=heights[k+1], c=heights[k+n], d=heights[k+n+1];
    const first=dx+dz<=1, gx=first?b-a:d-c, gz=first?c-a:d-b;
    if(Math.hypot(gx*(n-1)/width,gz*(m-1)/depth)>1) return null;
    // Same diagonal and winding as ForgeMapPhysicsAdapter's terrain trimesh.
    return first ? a+dx*gx+dz*gz : d+(dx-1)*gx+(dz-1)*gz;
  }

  heightAt(point) {
    const {x,z}=this.terrain.worldToCell(point);
    const type=this.terrain.terrainLayout[z]?.[x];
    if (!type || type==='blocked') return null;
    const land=type==='water' ? null : this.landHeight(point.x,point.z);
    const faces=this.faces.get(z*this.terrain.gridSize+x);
    if (!faces) return land;
    const height=(px,pz)=>{
      let top=-Infinity;
      for(const {a,b,c,normal} of faces) {
        const ab=(b.x-a.x)*(pz-a.z)-(b.z-a.z)*(px-a.x);
        const bc=(c.x-b.x)*(pz-b.z)-(c.z-b.z)*(px-b.x);
        const ca=(a.x-c.x)*(pz-c.z)-(a.z-c.z)*(px-c.x);
        if(Math.min(ab,bc,ca)<-1e-7 && Math.max(ab,bc,ca)>1e-7) continue;
        top=Math.max(top,a.y-((px-a.x)*normal.x+(pz-a.z)*normal.z)/normal.y);
      }
      return top;
    };
    let deck=height(point.x,point.z);
    // A capsule can straddle a narrow joint between two paving stones.
    if (!Number.isFinite(deck)) deck=Math.max(...[[.18,0],[-.18,0],[0,.18],[0,-.18]].map(([a,b])=>height(point.x+a,point.z+b)));
    return Number.isFinite(deck) ? Math.max(land ?? -Infinity,deck) : land;
  }
}
