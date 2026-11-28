import {browser,setup,local} from './browser.mjs';
import {appendFile} from 'node:fs/promises';
const groups=[['chrome','desktop'],['edge','desktop'],['firefox','desktop'],['webkit','linux-engine'],['chrome','touch-emulation']];
for(const [kind,mode] of groups.filter(([kind])=>!process.argv[2]||process.argv.slice(2).includes(kind))){
  const row={kind,mode,checks:{},issues:[],forcedFirefoxSoftware:process.env.QA_FIREFOX_SOFTWARE==='1'};
  let b;
  try{
    b=await browser(kind);
    const mobile=mode==='touch-emulation';
    const {context,page,issues,external}=await setup(b,mobile?{hasTouch:true,isMobile:true}: {});
    await page.addInitScript(()=>{
      window.qaAudio={contexts:[],starts:0,playResolved:0,playRejected:0};
      if(typeof AudioContext==='function'){
        const Orig=AudioContext;window.AudioContext=class extends Orig{constructor(...args){super(...args);window.qaAudio.contexts.push(this);}};
      }
      if(typeof AudioBufferSourceNode==='function'){
        const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){const r=start.apply(this,args);window.qaAudio.starts++;return r;};
      }
      const play=HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play=function(...args){return play.apply(this,args).then(v=>{window.qaAudio.playResolved++;return v;},e=>{window.qaAudio.playRejected++;throw e;});};
    });
    await page.goto(local+'game/',{timeout:30000});
    row.version=b.version();
    try{
      await page.waitForFunction(()=>window.__ROCKVILLE__?.combat?.ready&&document.querySelector('#loading').hidden,null,{timeout:33000});
    }catch(error){
      row.error=String(error);
      row.startFailure=await page.evaluate(()=>({status:document.querySelector('#loading')?.textContent,viewport:[innerWidth,innerHeight],webglProbe:!!document.createElement('canvas').getContext('webgl2'),ua:navigator.userAgent}));
      throw error;
    }finally{ row.issues=issues;row.external=external; }
    row.checks.coldLoad=true;
    row.environment=await page.evaluate(()=>{const a=window.__ROCKVILLE__,g=a.renderer.getContext(),d=g.getExtension('WEBGL_debug_renderer_info');return {ua:navigator.userAgent,renderer:d&&g.getParameter(d.UNMASKED_RENDERER_WEBGL),webgl:g.getParameter(g.VERSION),viewport:[innerWidth,innerHeight],timeToReadyMs:performance.now()};});
    row.checks.webgl2=row.environment.webgl.includes('WebGL 2');
    await page.locator('#graphics-preset').selectOption('low');
    await page.locator('#start').click();
    await page.waitForFunction(()=>window.__ROCKVILLE__.survival.state.round===1,null,{timeout:15000});
    const r=await page.evaluate(()=>{
      const a=window.__ROCKVILLE__;
      return {player:!!a.scene.getObjectByName('Cowgirl'),weapon:!!a.combat.currentWeapon,programs:a.renderer.info.programs.length,textures:a.renderer.info.memory.textures,maps:performance.getEntriesByType('resource').filter(r=>r.name.includes('/assets/environment/')).length};
    });
    Object.assign(row.checks,r);
    const before=await page.evaluate(()=>window.__ROCKVILLE__.scene.getObjectByName('Player').position.toArray());
    if(mobile){
      await page.tap('#aim');
      await page.waitForFunction(()=>document.querySelector('#hud').classList.contains('aimed'),null,{timeout:12000,polling:200}).catch(()=>{});
      row.checks.touchAim=await page.locator('#hud').evaluate(el=>el.classList.contains('aimed'));
      await page.tap('#aim');
      const session=await context.newCDPSession(page),box=await page.locator('#joystick').boundingBox();
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/4}]});
      await page.waitForTimeout(1700);
      await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }else{
      await page.keyboard.down('w');await page.waitForTimeout(1600);await page.keyboard.up('w');
    }
    row.checks.moved=await page.evaluate(([x,y,z])=>{const p=window.__ROCKVILLE__.scene.getObjectByName('Player').position;return Math.hypot(p.x-x,p.z-z)>0.1;},before);
    row.checks.audio=await page.evaluate(()=>({states:qaAudio.contexts.map(c=>c.state),starts:qaAudio.starts,mediaResolved:qaAudio.playResolved,mediaRejected:qaAudio.playRejected}));
    await page.waitForFunction(()=>window.__ROCKVILLE__.survival.state.alive>0,null,{timeout:150000,polling:250});
    row.checks.naturalZombie=true;
    row.checks.audio=await page.evaluate(()=>({states:qaAudio.contexts.map(c=>c.state),starts:qaAudio.starts,mediaResolved:qaAudio.playResolved,mediaRejected:qaAudio.playRejected}));
    const z=await page.evaluate(()=>{
      const a=window.__ROCKVILLE__, first=a.world.children.find(x=>x.name==='Prisoner Zombie');
      return {root:first?.position.toArray(),geometry:!!first?.getObjectByProperty('isSkinnedMesh',true),visible:!!first?.visible};
    });
    row.checks.zombie=z;
    row.presets=[];
    for(const preset of ['low','medium','high']){
      await page.evaluate(v=>{const s=document.querySelector('#graphics-preset');s.value=v;s.dispatchEvent(new Event('change'));},preset);
      await page.waitForTimeout(550);
      row.presets.push(await page.evaluate(()=>({
        setting:document.querySelector('#graphics-preset').value,width:window.__ROCKVILLE__.renderer.domElement.width,draws:window.__ROCKVILLE__.renderer.info.render.calls
      })));
    }
    row.checks.offlineAssets=external.length===0&&issues.length===0;
    row.checks.contextLoss=await page.evaluate(()=>qaContextLoss);
  }catch(error){row.error??=String(error);}finally{await b?.close();}
  await appendFile('../out/compat.ndjson',JSON.stringify(row)+'\n');
  console.log(kind,mode,JSON.stringify(row).slice(0,2300));
}
