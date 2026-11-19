import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch();
try {
 for (const venue of (process.argv.slice(2).length ? process.argv.slice(2) : ['church_square','campfire','apple_tree'])) {
  const page = await browser.newPage({viewport:{width:480,height:320}});
  await page.goto('http://127.0.0.1:5173/src/demos/chii-island/?church-town',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__chiiAgents && window.__townSocialSystem,null,{timeout:90000});
  const start = await page.evaluate(async venue=>{
    const t=window.__townSocialSystem; window.__renderer.render=()=>{}; // Skip drawing in headless QA; leave physics, timers and movement running.
     t.stopActivity('test-reset');
    const ids=['fangk','momo','mako','yafo','lingq','mok','crab'];
    const plan=t._validatePlan({id:'nav-'+venue,type:'custom_festival',title:'寻路排练',participants:ids,locationId:venue});
    plan.festivalProgram={events:[{id:'stage',name:'开场',seconds:6}],cast:Object.fromEntries(ids.map(id=>[id,{role:id==='fangk'?'host':'participant',steps:[{eventId:'stage',kind:'wait',name:'站立',animation:'idle',seconds:6}]}])),links:[]};
    if(!t._beginActivity(plan))throw Error(t.lastNotice);
    return ids.map(id=>[id,t.findParticipant(id).mesh.position.toArray().map(Math.round)]);
  },venue);
  console.log(venue,JSON.stringify(start));
  await page.waitForFunction(()=>window.__townSocialSystem.coordinator.active,null,{timeout:30000});
  const result=await page.evaluate(async ()=>{
   const { Box3 }=await import('/node_modules/three/build/three.module.js');
   const supports=[...window.__chiiColliderRegistry.records.values()].flatMap(r=>{
     const spec=r.entity.mesh.userData.collider;
     return spec?.type==='bridge'?r.colliders.slice(0,spec.deckSegments?.length || 1):[];
   });
   const worst={root:0,visual:0,body:0}; let frames=0;
   const sampleHeight=()=>{
     for (const {p} of original) {
       const pos=p.mesh.position, ray={origin:{x:pos.x,y:100,z:pos.z},dir:{x:0,y:-1,z:0}};
       let ground=0;
       const deckAt=(dx,dz)=>{
         ray.origin.x=pos.x+dx; ray.origin.z=pos.z+dz;
         let y=-Infinity;
         for(const c of supports){const hit=c.castRayAndGetNormal(ray,110,false);if(hit&&hit.normal.y>.7071) y=Math.max(y,100-hit.timeOfImpact);}
         return y;
       };
       if(supports.some(c=>{const t=c.translation();return Math.abs(t.x-pos.x)<8 && Math.abs(t.z-pos.z)<8;})) {
         let y=deckAt(0,0);
         if(!Number.isFinite(y)) y=Math.max(deckAt(.18,0),deckAt(-.18,0),deckAt(0,.18),deckAt(0,-.18));
         ground=Math.max(0,y);
       }
       const error=Math.abs(pos.y-ground);

       if(error>worst.root)Object.assign(worst,{root:error,where:[p._residentId,...pos.toArray(),ground]});
       worst.body=Math.max(worst.body,Math.abs(p._body.translation().y-ground));
       if(frames%12===0){p.mesh.updateWorldMatrix(true,true);const y=new Box3().setFromObject(p._modelGroup,true).min.y;
         if(y-ground>worst.visual)Object.assign(worst,{visual:y-ground,visualWho:p._residentId});}
     }
     frames++;
   };
   const town=window.__townSocialSystem, g=town.coordinator.active, original=g.participants.map((p,i)=>({p,slot:g.slots[i]}));
   const v=p=>p&&[p.x,p.z].map(n=>Math.round(n*10)/10);
   const snap=()=>original.map(({p,slot})=>({id:p._residentId,pos:v(p.mesh.position),slot:v(slot),next:v(p._navigationPath[0]),target:v(p._targetPosition),dist:Math.round(Math.hypot(slot.x-p.mesh.position.x,slot.z-p.mesh.position.z)),path:p._navigation.findPath(p.mesh.position,slot).length}));
   const samples=[snap()]; let last=0;
   await new Promise((resolve,reject)=>{const end=Date.now()+100000; const frame=()=>{sampleHeight();if(town.activeActivity?.status!=='gathering'){resolve();return;}if(Date.now()>end){reject(Error('gathering timeout '+JSON.stringify(snap())));return;}if(g.elapsed-last>10){last=g.elapsed;samples.push(snap());}requestAnimationFrame(frame);};frame();});
   return {phase:town.activeActivity?.status,cast:town.activeActivity?.plan.participants,samples,final:snap(),worst,frames,landing:original.map(({p})=>[p._residentId,p.mesh.position.y])};
  });
  if (result.phase !== 'performing' || result.cast?.length !== 7) console.error(JSON.stringify(result));
  else console.log(venue, 'arrived:', result.cast.join(', '), 'slots:', result.final.map(p=>p.slot));
  console.log(venue, result.frames, result.worst, result.landing);
  await page.close();
  assert.ok(result.worst.root<0.18 && result.worst.body<0.18 && result.worst.visual<0.55,JSON.stringify(result.worst));
  assert.equal(result.phase,'performing');assert.equal(result.cast.length,7);
 }
}finally{await browser.close()}
