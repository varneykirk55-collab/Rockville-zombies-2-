import {browser,setup,ready,local} from './browser.mjs';
import {views,prepareCamera} from './locations.mjs';
import {writeFile,readFile} from 'node:fs/promises';
const b=await browser();
const output={visual:[],profile:null};
try{
  if(!process.argv.includes('--cpu-only')){
  const a=await setup(b,{viewport:{width:480,height:270}});
  await a.page.goto(local+'game/?audit=1');
  await ready(a.page,true);
  await prepareCamera(a.page);
  output.visual=await a.page.evaluate(async({views})=>{
    const game=window.__ROCKVILLE__,render=game.renderer.render.bind(game.renderer);
    const {scene,world,camera,renderer}=game;
    renderer.render=()=>{};
    const gl=renderer.getContext(),px=new Uint8Array(4);
    const ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const matProps=['normalMap','roughnessMap','aoMap'];
    const originals=new Map();
    scene.traverse(o=>{for(const v of [].concat(o.material||[]))if(v.isMeshStandardMaterial){
      const row=matProps.map(p=>[p,v[p]]);
      if(row.some(([,value])=>value))originals.set(v,row);
    }});
    const testSets={
      shadows:()=>{renderer.shadowMap.enabled=false;return()=>{renderer.shadowMap.enabled=true;};},
      buildings:()=>{const o=scene.getObjectByName('Buildings');o.visible=false;return()=>{o.visible=true;};},
      vegetation:()=>{const a=scene.getObjectByName('Backdrop tree trunks'),b=scene.getObjectByName('Backdrop tree crowns');a.visible=b.visible=false;return()=>{a.visible=b.visible=true;};},
      streetscape:()=>{const a=scene.getObjectByName('Reference-based streetscape and landscaping');a.visible=false;return()=>{a.visible=true;};},
      facades:()=>{const a=[];scene.traverse(o=>{if(o.name==='Street-facing entrances and facade trim'||o.name==='Glass'||o.name==='Window frames'){a.push(o);o.visible=false;}});return()=>a.forEach(o=>o.visible=true);},
      pbrDetailMaps:()=>{for(const [mat,props] of originals){for(const [name] of props)mat[name]=null;mat.needsUpdate=true;}return()=>{for(const [mat,props] of originals){for(const [name,tex] of props)mat[name]=tex;mat.needsUpdate=true;}};},
    };
    const results=[];
    try{
      for(const [location,pose] of Object.entries(views)){
        qaCamera(pose,'medium');
        for(const [feature,change] of [['full',()=>()=>{}],...Object.entries(testSets),['full-repeat',()=>()=>{}]]){
          const restore=change();
          const samples=[];
          for(let i=0;i<4;i++){
            renderer.shadowMap.needsUpdate=i===0;
            const query=ext?gl.createQuery():null;
            if(query)gl.beginQuery(ext.TIME_ELAPSED_EXT,query);
            const start=performance.now();
            render(scene,camera);
            const submitted=performance.now();
            if(query)gl.endQuery(ext.TIME_ELAPSED_EXT);
            gl.readPixels(gl.drawingBufferWidth>>1,gl.drawingBufferHeight>>1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);
            const waited=performance.now();
            let gpu=null;
            if(query){
              for(let n=0;n<5;n++){
                await new Promise(r=>setTimeout(r,30));
                if(gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE)){
                  if(!gl.getParameter(ext.GPU_DISJOINT_EXT))gpu=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;
                  break;
                }
              }
              gl.deleteQuery(query);
            }
            samples.push({ms:waited-start,submitMs:submitted-start,gpuBackendMs:gpu,
              draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,readback:[...px]});
          }
          restore();
          results.push({location,feature,preset:'medium',samples});
        }
      }
    }finally{renderer.render=render;}
    return results;
  },{views:{'regal-theater':views['regal-theater'],'citywide-overview':views['citywide-overview']}});
  output.auditIssues=a.issues;
  await writeFile('../out/feature-isolation.json',JSON.stringify(output.visual));
  await a.context.close();
  }

  const p=await setup(b,{viewport:{width:480,height:270}});
  const cd=await p.context.newCDPSession(p.page);
  await cd.send('Profiler.enable');
  await cd.send('Profiler.setSamplingInterval',{interval:1000});
  await cd.send('Profiler.start');
  await p.page.goto(local+'game/');
  await ready(p.page);
  const startup=(await cd.send('Profiler.stop')).profile;
  await p.page.locator('#graphics-preset').selectOption('low');
  await p.page.locator('#start').click();
  await p.page.waitForFunction(()=>window.__ROCKVILLE__.survival.state.alive>0,null,{timeout:120000,polling:200});
  const before=await p.page.evaluate(()=>window.__ROCKVILLE__.survival.state);
  await cd.send('Profiler.start');
  await p.page.keyboard.down('w');
  await p.page.waitForTimeout(3700);
  await p.page.keyboard.up('w');
  await p.page.keyboard.press('q');
  await p.page.mouse.down();
  await p.page.waitForTimeout(12000);
  await p.page.mouse.up();
  await p.page.waitForTimeout(5000);
  const active=(await cd.send('Profiler.stop')).profile;
  const state=await p.page.evaluate(()=>({survival:window.__ROCKVILLE__.survival.state,combat:window.__ROCKVILLE__.combat.state,contextLoss:qaContextLoss}));
  output.profile={startup,active,before,state,issues:p.issues,external:p.external};
  await writeFile('../out/chromium-cpu-profile.json',JSON.stringify(output.profile));
  await p.context.close();
}finally{await b.close();}
