import {browser,setup,ready,local} from './browser.mjs';
import {mkdir,writeFile,appendFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const out='../out';
const combatOnly=process.argv.includes('--combat-only');
const isolated=process.argv.includes('--isolated');
const retry=isolated||process.argv.includes('--stable-retry');
const dataName=isolated?'stability-isolated':retry?'stability-retry':'stability';
const b=await browser();
const {context,page,issues,external}=await setup(b,retry?{viewport:{width:480,height:270}}:{});
page.setDefaultTimeout(145000);
page.on('crash',()=>appendFile(out+'/events.ndjson',JSON.stringify({time:new Date().toISOString(),mode:dataName,event:'page crash'})+'\n').catch(()=>{}));
try {
  const cdp=await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.goto(local+'game/');
  await ready(page);
  await page.locator('#graphics-preset').selectOption('low');
  await page.locator('#start').click({timeout:30000});
  const boot=async()=>{
    await page.evaluate(async combatControlAligned=>{
      const a=window.__ROCKVILLE__;
      const {lonLatToWorld}=await import('./src/utils.js');
      const {Vector3}=await import('three');
      const routes=[[-77.15018,39.08410],[-77.15059,39.08413],[-77.15072,39.08447],[-77.15096,39.08520],[-77.15116,39.08568],[-77.15166,39.08608],[-77.1511,39.08625],[-77.1502,39.08599],[-77.14967,39.08578],[-77.1491,39.08611],[-77.14915,39.0851],[-77.14935,39.08426]].map(p=>lonLatToWorld(...p));
      const start=a.scene.getObjectByName('Player').position.clone();
      routes.unshift({x:start.x-16,z:start.z+2});
      const canvas=a.renderer.domElement;
      const key=(code,pressed)=>document.dispatchEvent(new KeyboardEvent(pressed?'keydown':'keyup',{code,bubbles:true}));
      const mouse=(button,pressed)=>(pressed?canvas:window).dispatchEvent(new PointerEvent(pressed?'pointerdown':'pointerup',{button,pointerType:'mouse',bubbles:true}));
      // Enable the game's own drag fallback if headless pointer lock is unavailable.
      document.dispatchEvent(new Event('pointerlockerror'));
      const held=new Set();
      function keys(want) {
        for(const k of held)if(!want.has(k)){key(k,false);held.delete(k);}
        for(const k of want)if(!held.has(k)){key(k,true);held.add(k);}
      }
      const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
      const clamp=(x,max)=>Math.max(-max,Math.min(max,x));
      let ticks=0,route=0,fire=false,aim=false,last,floor=0,dead=0,lastFrame=-1;
      const stats={maxRound:1,maxPoints:500,maxKills:0,deaths:0,distance:0,positions:[],attempts:[],controls:{}};
      window.qaRun=stats;
      window.qaMode='combat';
      function press(code){key(code,true);key(code,false);stats.controls[code]=(stats.controls[code]||0)+1;}
      function look(yaw,pitch){
        const scale=aim?0.0021*0.53:0.0021;
        document.dispatchEvent(new MouseEvent('mousemove',{buttons:1,movementX:Math.round(clamp(wrap(a.camera.rotation.y-yaw)/scale,160)),movementY:Math.round(clamp((a.camera.rotation.x-pitch)/scale,75))}));
      }
      window.qaDriver=setInterval(()=>{
        if(combatControlAligned){const frame=a.renderer.info.render.frame;if(frame===lastFrame)return;lastFrame=frame;}
        ticks++;
        const player=a.scene.getObjectByName('Player').position;
        const state=a.survival.state, weapon=a.combat.state, machines=a.machines.state;
        if(last)stats.distance+=Math.min(4,Math.hypot(last.x-player.x,last.z-player.z));
        if(!last||ticks%30===0)stats.positions.push([+player.x.toFixed(1),+player.z.toFixed(1)]);
        stats.maxRound=Math.max(stats.maxRound,state.round);
        stats.maxPoints=Math.max(stats.maxPoints,machines.points);
        stats.maxKills=Math.max(stats.maxKills,state.kills);
        stats.shots=weapon.shots;stats.hits=weapon.hits;
        if(state.phase==='dead'){
          keys(new Set());if(fire){mouse(0,false);fire=false;}if(aim){mouse(2,false);aim=false;}
          if(!dead){dead=ticks;stats.deaths++;}return;
        }
        const foes=a.world.children.filter(o=>o.name==='Prisoner Zombie'&&o.position.distanceTo(player)<48).map(o=>{
          const v=o.position.clone().add(new Vector3(0,1.1,0));
          const ray=v.clone().sub(a.camera.position).normalize();
          const hit=a.survival.trace({origin:a.camera.position,direction:ray,distanceSqToPoint:pt=>{const v=pt.clone().sub(a.camera.position),t=Math.max(0,v.dot(ray));return v.addScaledVector(ray,-t).lengthSq();},intersectSphere:(sphere,target)=>{const v=sphere.center.clone().sub(a.camera.position),p=v.dot(ray),q=sphere.radius**2-(v.lengthSq()-p*p);if(q<0||p+Math.sqrt(q)<0)return null;return target.copy(a.camera.position).addScaledVector(ray,Math.max(0,p-Math.sqrt(q)));}},60);
          return {o,v,rank:o.position.distanceTo(player),alive:!!hit};
        }).filter(x=>x.alive).sort((a,b)=>a.rank-b.rank);
        const target=window.qaMode==='combat'?foes[0]:null;
        let move=new Set();
        if(target){
          const d=target.v.clone().sub(a.camera.position);
          const yaw=Math.atan2(-d.x,-d.z), pitch=Math.atan2(d.y,Math.hypot(d.x,d.z));
          look(yaw,pitch);
          if(!aim){mouse(2,true);aim=true;}
          if(Math.abs(wrap(a.camera.rotation.y-yaw))<0.14&&Math.abs(a.camera.rotation.x-pitch)<0.14&&!weapon.blockedShot){
            if(!fire||weapon.active===2){if(fire)mouse(0,false);mouse(0,true);fire=true;}
          }else if(fire){mouse(0,false);fire=false;}
          if(target.rank<8)move.add('KeyS');
          if(weapon.blockedShot||ticks%19>12)move.add(ticks%68<34?'KeyA':'KeyD');
          if(weapon.ammo[weapon.active][0]<=1&&!weapon.animation.reloading)press('KeyR');
        }else{
          if(fire){mouse(0,false);fire=false;}if(aim){mouse(2,false);aim=false;}
          const target=routes[route];
          const dx=target.x-player.x,dz=target.z-player.z;
          floor=last&&Math.hypot(player.x-last.x,player.z-last.z)<0.027?floor+1:0;
          if(Math.hypot(dx,dz)<2||floor>24){route=(route+1)%routes.length;floor=0;}
          look(Math.atan2(-dx,-dz),-0.04);
          move.add('KeyW');
          if(window.qaMode==='traverse')move.add('ShiftLeft');
        }
        keys(move);last=player.clone();
        if(ticks%105===0)press('KeyQ');
        if(ticks%166===0)press('Space');
        if(ticks%184===0)press('Digit'+(1+Math.floor(ticks/184)%3));
        if(ticks%194===0)press('KeyR');
        if(ticks%7===0&&document.querySelector('#machine-prompt').textContent.includes('E'))press('KeyE');
      },180);
    },combatOnly||retry);
  };
  await boot();
  const t0=performance.now();
  let recording, chain=Promise.resolve();
  cdp.on('Page.screencastFrame',({data,sessionId,metadata})=>{
    cdp.send('Page.screencastFrameAck',{sessionId}).catch(()=>{});
    const r=recording;
    if(!r)return;
    const name=String(r.n++).padStart(5,'0')+'.jpg';
    r.frames.push([name,metadata.timestamp]);
    chain=chain.then(async()=>{await writeFile(r.dir+'/'+name,Buffer.from(data,'base64'));
      await appendFile(r.dir+'/frames-live.ndjson',JSON.stringify([name,metadata.timestamp])+'\n');});
  });
  async function startClip(name){
    const dir=out+'/'+name;await mkdir(dir,{recursive:true});await writeFile(dir+'/frames-live.ndjson','');
    recording={dir,n:0,frames:[]};
    await cdp.send('Page.startScreencast',{format:'jpeg',quality:76,maxWidth:640,maxHeight:360,everyNthFrame:1});
    console.log('RECORD',name);
  }
  async function endClip(){
    if(!recording)return;
    await cdp.send('Page.stopScreencast');const clip=recording;recording=null;
    await chain;await writeFile(clip.dir+'/frames.json',JSON.stringify(clip.frames));
  }
  let next=0, restarted=false, traversal=false;
  await appendFile(out+'/events.ndjson',JSON.stringify({time:new Date().toISOString(),mode:dataName,event:'start'})+'\n');
  if(!retry)await startClip(combatOnly?'B-combat-extended':'B-combat');
  while(performance.now()-t0<(combatOnly?155000:1805000)){
    const seconds=(performance.now()-t0)/1000;
    if(!combatOnly&&seconds>=next){
      const metrics=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
      const dom=await cdp.send('Memory.getDOMCounters');
      const sample=await page.evaluate(()=>{
        const a=window.__ROCKVILLE__, f=qaFrames.slice(-800);
        const count={n:0,zombies:0,visible:0,audioNodes:0};
        a.scene.traverse(o=>{count.n++;if(o.visible)count.visible++;if(o.name==='Prisoner Zombie')count.zombies++;if(o.isAudio)count.audioNodes++;});
        return {survival:a.survival.state,combat:a.combat.state,points:a.machines.state.points,preset:document.querySelector('#graphics-preset').value,
          driver:window.qaRun,count,renderer:{render:{...a.renderer.info.render},memory:{...a.renderer.info.memory},programs:a.renderer.info.programs.length},
          observedIntervals:f, contextLoss:qaContextLoss,heap:performance.memory?.usedJSHeapSize};
      });
      const row={seconds:+seconds.toFixed(1),metrics,dom,sample,issues:[...issues],external:[...external]};
      await appendFile(out+'/'+dataName+'.ndjson',JSON.stringify(row)+'\n');
      console.log('SAMPLE',row.seconds,sample.preset,sample.survival.phase,sample.survival.round,metrics.JSHeapUsedSize,sample.driver?.distance);
      next+=300;
    }
    if(!retry&&!combatOnly&&seconds>=123&&!traversal){
      await endClip();traversal=true;
      await page.evaluate(()=>window.qaMode='traverse');
      await startClip('A-traversal');
    }
    if(seconds>=247&&recording){
      await endClip();
      await page.evaluate(()=>window.qaMode='combat');
    }
    const dead=await page.evaluate(()=>window.__ROCKVILLE__?.survival.dead);
    if(dead){
      const state=await page.evaluate(()=>({run:qaRun,state:window.__ROCKVILLE__.survival.state,points:window.__ROCKVILLE__.machines.state.points}));
      await appendFile(out+(isolated?'/attempts-isolated.ndjson':retry?'/attempts-retry.ndjson':'/attempts.ndjson'),JSON.stringify({seconds,state})+'\n');
      await page.locator('#restart-rounds').click();
      await ready(page);
      await page.locator('#graphics-preset').selectOption(combatOnly||retry||seconds<600?'low':seconds<1200?'medium':'high');
      await page.locator('#start').click();
      await boot();
      if(traversal&&seconds<247)await page.evaluate(()=>window.qaMode='traverse');
      restarted=true;
    }
    const wanted=combatOnly||retry||seconds<600?'low':seconds<1200?'medium':'high';
    if(!retry&&await page.evaluate(()=>document.querySelector('#graphics-preset')?.value)!==wanted) {
      await page.evaluate(p=>{const sel=document.querySelector('#graphics-preset');sel.value=p;sel.dispatchEvent(new Event('change'));},wanted);
    }
    await pause(1250);
  }
  await endClip();
  await appendFile(out+'/events.ndjson',JSON.stringify({time:new Date().toISOString(),mode:dataName,event:'end',elapsedSeconds:(performance.now()-t0)/1000})+'\n');
  await writeFile(out+(combatOnly?'/extended-combat-summary.json':isolated?'/session-isolated-summary.json':retry?'/session-retry-summary.json':'/session-summary.json'),JSON.stringify({restarted,issues,external,final:await page.evaluate(()=>({run:qaRun,survival:window.__ROCKVILLE__.survival.state}))}));
}catch(error){await appendFile(out+'/events.ndjson',JSON.stringify({time:new Date().toISOString(),mode:dataName,error:String(error),issues:[...issues]})+'\n');throw error;}finally{await b.close();}
