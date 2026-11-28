import {browser,setup,ready,local} from './browser.mjs';
import {views,prepareCamera} from './locations.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await browser();
const traversalOnly=process.argv.includes('--traversal-only');
const detailOnly=process.argv.includes('--details-only');
const record=async(context,page,name,action)=>{
  const cd=await context.newCDPSession(page);
  const dir='../out/'+name;
  await mkdir(dir,{recursive:true});
  const frames=[];
  let writes=Promise.resolve();
  cd.on('Page.screencastFrame',({data,sessionId,metadata})=>{
    cd.send('Page.screencastFrameAck',{sessionId}).catch(()=>{});
    const path=String(frames.length).padStart(5,'0')+'.jpg';
    frames.push([path,metadata.timestamp]);
    writes=writes.then(()=>writeFile(dir+'/'+path,Buffer.from(data,'base64')));
  });
  await cd.send('Page.startScreencast',{format:'jpeg',quality:78,maxWidth:640,maxHeight:360,everyNthFrame:1});
  try{await action(frames);}finally{
    await cd.send('Page.stopScreencast');await writes;
    await writeFile(dir+'/frames.json',JSON.stringify(frames));
  }
  console.log(name,frames.length,frames.at(-1)?.[1]-frames[0]?.[1]);
};
try{
 const a=await setup(b);
 await a.page.goto(local+'game/?audit=1');
 await ready(a.page,true);
 const path=await a.page.evaluate(async()=>{
   const {lonLatToWorld}=await import('./src/utils.js');
   const boundaries=await fetch('./public/data/districts/boundaries.geojson').then(r=>r.json());
   const district=(x,z)=>boundaries.features.find(f=>{
     const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
     return polygons.some(([ring])=>{
       const points=ring.map(([lon,lat])=>lonLatToWorld(lon,lat));let inside=false;
       for(let i=0,j=points.length-1;i<points.length;j=i++){
         const a=points[i],b=points[j];
         if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;
       }
       return inside;
     });
   })?.properties?.id;
   const blocked=window.__ROCKVILLE__.blocked;
   const p=lonLatToWorld(-77.15064,39.08464);
   // Select a clear short crossing between the two central districts.
   let best;
   for(let x=Math.round(p.x)-31;x<=p.x+31;x+=2){
     for(let z=Math.round(p.z)-31;z<=p.z+31;z+=2){
       const from=district(x,z);if(!from||blocked(x,z,0.72))continue;
       for(const [dx,dz] of [[1,0],[0,1],[-1,0],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
         let count=0,end,steps=[];
         for(let i=1;i<=92;i++){
           const tx=x+dx*i,tz=z+dz*i;
           if(blocked(tx,tz,0.78))break;
           end=district(tx,tz);
           steps.push([tx,tz,end]);
           if(end&&end!==from)count++;
         }
         if(count<12||steps.findIndex(p=>p[2]&&p[2]!==from)<8)continue;
         const crossing=steps.findIndex(t=>t[2]&&t[2]!==from);
         const score=steps.length-1.6*crossing-.22*Math.hypot(x-p.x,z-p.z);
         if(!best||score>best.score)best={start:[x,z,from],steps,score};
       }
     }
   }
   return best;
 });
 console.log('WALK ROUTE',JSON.stringify(path?.start),JSON.stringify(path?.steps.at(-1)));
 if(!traversalOnly){
 await prepareCamera(a.page);
 await a.page.evaluate(()=>{
   const badge=document.createElement('output');
   badge.id='qa-perf-overlay';
   Object.assign(badge.style,{position:'fixed',top:'10px',left:'10px',zIndex:50000,background:'#14212aee',color:'#fff',padding:'8px 12px',font:'700 14px monospace',whiteSpace:'pre'});
   document.body.append(badge);
   setInterval(()=>{
     const shown=window.qaFrames.slice(-20), data=shown.filter(v=>v>0), avg=data.reduce((a,b)=>a+b,0)/Math.max(1,data.length);
     badge.textContent=(window.qaClipTitle||'Rockville 009')+'\n'+(avg>0?(1000/avg).toFixed(1)+' FPS · '+avg.toFixed(0)+' ms mean frame':'Measuring…')+' · SwiftShader · '+(performance.now()/1000).toFixed(1)+'s';
   },500);
 });
 await record(a.context,a.page,'C-presets',async()=>{
   for(const preset of ['low','medium','high']){
     await a.page.evaluate(({p,preset})=>{
       window.qaFrames.length=0;window.qaClipTitle='Gibbs Street · '+preset.toUpperCase();
       qaCamera(p,preset);
     },{p:views['gibbs-street'],preset});
     await sleep(16500);
   }
 });
 await record(a.context,a.page,'D-defects',async()=>{
   await a.page.evaluate(p=>{window.qaClipTitle='East Montgomery · overlapping crosswalk markings';qaCamera(p,'high');},views['east-montgomery-avenue']);
   await sleep(14000);
   await a.page.evaluate(p=>{window.qaClipTitle='North Washington · blank street-facing walls';qaCamera(p,'high');},views['north-washington-street']);
   await sleep(14000);
 });
 }
 await a.context.close();
 if(!detailOnly){
 if(!path)throw Error('No audited between-district traversal route');
 const g=await setup(b);
 // Stage the starting point only for the traversal footage. Collision remains live.
 await g.page.route('**/src/camera.js',async route=>{
   const code=await readFile('../game/src/camera.js','utf8');
   const replacement=code.replace('    const spawn = safeSpawn(blocked);',
     '    const seed = '+JSON.stringify(path.start.slice(0,2))+';\n    const spawn = {x:seed[0],z:seed[1]};');
   if(code===replacement)throw Error('No starting-position hook');
   await route.fulfill({status:200,contentType:'text/javascript',body:replacement});
 });
 await g.page.goto(local+'game/');
 await ready(g.page);
 await g.page.locator('#graphics-preset').selectOption('low');
 await g.page.locator('#start').click();
 await g.page.evaluate(path=>{
   const a=window.__ROCKVILLE__,player=a.scene.getObjectByName('Player');
   const send=(code,down)=>document.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{bubbles:true,code}));
   document.dispatchEvent(new Event('pointerlockerror'));
   window.qaWalk={positions:[],stuck:0};
   const points=[...path.steps.filter((_,i)=>i%8===7),path.steps.at(-1)];
   let i=0, direction=1, lastFrame=-1;
   a.survival.update=()=>{};
   const timer=setInterval(()=>{
     const frame=a.renderer.info.render.frame;if(frame===lastFrame)return; lastFrame=frame;
     const target=points[i],pos=player.position;
     if(!target||a.survival.dead){send('KeyW',false);send('ShiftLeft',false);clearInterval(timer);return;}
     const dx=target[0]-pos.x,dz=target[1]-pos.z;
     const d=Math.hypot(dx,dz);
     if(d<1.1){if(i===points.length-1)direction=-1;else if(i===0)direction=1; i+=direction;return;}
     const yaw=Math.atan2(-dx,-dz),angle=a.camera.rotation.y-yaw;
     const limit=Math.max(-240,Math.min(240,Math.atan2(Math.sin(angle),Math.cos(angle))/.0021));
     document.dispatchEvent(new MouseEvent('mousemove',{buttons:1,movementX:Math.round(limit),movementY:Math.round((a.camera.rotation.x+0.045)/.0021)}));
     if(Math.abs(limit)<100){send('KeyW',true);send('ShiftLeft',true);}else{send('KeyW',false);send('ShiftLeft',false);}
     window.qaWalk.positions.push([+pos.x.toFixed(1),+pos.z.toFixed(1),i]);
   },260);
 },path);
 await record(g.context,g.page,'A-verified-traversal',async(frames)=>{
   const start=performance.now();
   while(performance.now()-start<235000&&(frames.length<2||frames.at(-1)[1]-frames[0][1]<128)){
     await sleep(3000);
   }
 });
 await writeFile('../out/traversal-evidence.json',JSON.stringify({path,actual:await g.page.evaluate(()=>qaWalk),issues:g.issues}));
 await g.context.close();
 }
}finally{await b.close();}
