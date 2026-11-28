import {appendFile,readFile,writeFile} from 'node:fs/promises';
import {browser,setup,ready,local} from './browser.mjs';
import {views,measured,prepareCamera} from './locations.mjs';
const phase=process.argv[2]||'matrix';
const pathname='../out/'+phase+'.ndjson';
const b=await browser();
const gameLoopHook=src=>src.replace('    update(delta);',`    const qaUpdateAt=performance.now();
    update(delta);
    const qaRenderAt=performance.now();`).replace('    renderer.render(scene, camera);',`    renderer.render(scene, camera);
    window.qaFrameHook?.({time, update:qaRenderAt-qaUpdateAt, render:performance.now()-qaRenderAt});`);
const zombieHook=src=>src.replace('  function update(delta, armed) {',`  function update(delta, armed) {
    if(window.qaActors) {
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      let shadows=0;
      for (const zombie of living) if(renderZombie(zombie,delta,shadows<3))shadows++;
      return;
    }`).replace('    prepare, update, hit, trace,',`    prepare, update, hit, trace,
    qaStage(count){
      window.qaActors=true;
      while(living.length>count)release(living.pop());
      const fx=-Math.sin(camera.rotation.y),fz=-Math.cos(camera.rotation.y);
      living.forEach((z,i)=>{
        const front=6+Math.floor(i/10)*3, side=(i%10-4.5)*0.78;
        const x=camera.position.x+fx*front+fz*side, zz=camera.position.z+fz*front-fx*side;
        z.root.position.set(x,controls.sampleGround(x,zz),zz);
        z.root.rotation.y=camera.rotation.y;
      });
      for(let i=living.length;i<count;i++){
        const front=6+Math.floor(i/10)*3, side=(i%10-4.5)*0.78;
        const x=camera.position.x+fx*front+fz*side, zz=camera.position.z+fz*front-fx*side;
        const z=acquire(x,zz);transition(z,'Walk',0);z.root.rotation.y=camera.rotation.y;
      }
    },`);
try {
  for(const build of ['baseline','game']){
    const {context,page,issues,external}=await setup(b);
    await page.route(/\/(zombies|game-loop)\.js$/,async route=>{
      const filename=new URL(route.request().url()).pathname.split('/').pop();
      const src=await readFile('../'+build+'/src/'+filename,'utf8');
      const instrument=filename==='zombies.js'?zombieHook(src):gameLoopHook(src);
      if(src===instrument)throw Error('Instrumentation did not match '+build+'/'+filename);
      await route.fulfill({status:200,contentType:'text/javascript',body:instrument});
    });
    await page.addInitScript(()=>{
      const gl=WebGL2RenderingContext.prototype;
      window.qaShaders=[];
      for(const name of ['compileShader','linkProgram','getShaderParameter','getProgramParameter']){
        const call=gl[name];
        gl[name]=function(...a){
          const t=performance.now(),result=call.apply(this,a),ms=performance.now()-t;
          if(name==='compileShader'||name==='linkProgram'||ms>=4)window.qaShaders.push({kind:name,time:t,ms});
          return result;
        };
      }
    });
    const start=Date.now();
    await page.goto(local+build+'/?autostart');
    await ready(page);
    await prepareCamera(page);
    const env=await page.evaluate(()=>{const a=window.__ROCKVILLE__,g=a.renderer.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return {
      browser:navigator.userAgent,logicalCPU:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory,
      vendor:e&&g.getParameter(e.UNMASKED_VENDOR_WEBGL),renderer:e&&g.getParameter(e.UNMASKED_RENDERER_WEBGL),
      webgl:g.getParameter(g.VERSION),timerQuery:g.getSupportedExtensions().includes('EXT_disjoint_timer_query_webgl2'),
      viewport:[innerWidth,innerHeight],resources:performance.getEntriesByType('resource').map(r=>[r.name,r.duration,r.encodedBodySize]),
      timeToReadyMs:performance.now(),shaders:window.qaShaders,
    };});
    await writeFile('../out/'+phase+'-'+build+'-environment.json', JSON.stringify({...env,elapsedMs:Date.now()-start}));
    const locations=phase==='matrix'?measured:['regal-theater','citywide-overview'];
    for(const id of locations){
      const presets=phase==='matrix'?['low','medium','high']:['low','medium'];
      for(const p of presets){
        if(phase==='targets')await page.setViewportSize(p==='low'?{width:1280,height:720}:{width:1920,height:1080});
        for(const n of phase==='matrix'?[0,6,10,24,50]:[6,24]){
          const result=await page.evaluate(async({pose,p,n,duration})=>{
            const a=window.__ROCKVILLE__,shadersAt=window.qaShaders.length;
            const gl=a.renderer.getContext(), ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
            window.qaCamera(pose,p);a.survival.qaStage(n);
            const warm=[];
            await new Promise(resolve=>{
              window.qaFrameHook=frame=>{warm.push(frame);if(warm.length>=3){window.qaFrameHook=null;resolve();}};
            });
            const frames=await new Promise(resolve=>{
              let begin,previous;const data=[];
              window.qaFrameHook=frame=>{
                if(begin===undefined)begin=frame.time;
                if(previous!==undefined)data.push({...frame,interval:frame.time-previous,
                  calls:a.renderer.info.render.calls,triangles:a.renderer.info.render.triangles});
                previous=frame.time;
                if(frame.time-begin>=duration&&data.length>=2){window.qaFrameHook=null;resolve(data);}
              };
            });
            const textures=new Set();let objects=0,visible=0;
            a.scene.traverse(object=>{
              objects++;if(object.visible)visible++;
              for(const material of [].concat(object.material||[]))
                for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
            });
            if(a.scene.background?.isTexture)textures.add(a.scene.background);
            let bytes=0;
            for(const t of textures){
              const image=t.image;
              if(image?.width&&image?.height)bytes+=image.width*image.height*4*(t.generateMipmaps?4/3:1);
            }
            return {frames,warm,actors:n,viewport:[innerWidth,innerHeight],resolution:[gl.drawingBufferWidth,gl.drawingBufferHeight],
              objects,visible,heap:performance.memory?.usedJSHeapSize??null,gpuFrameMs:null,gpuTimerAvailable:!!ext,
              renderInfo:{...a.renderer.info.memory},estimatedTextureBytes:Math.round(bytes),
              shaders:window.qaShaders.slice(shadersAt),contextLoss:window.qaContextLoss};
          },{pose:views[id],p,n,duration:phase==='matrix'?1800:4500});
          const line={build,location:id,preset:p,zombies:n,...result};
          await appendFile(pathname,JSON.stringify(line)+'\n');
          console.log(build,id,p,n,result.frames.length,result.frames.map(f=>f.interval).reduce((x,y)=>x+y,0).toFixed(0));
        }
      }
    }
    await writeFile('../out/'+phase+'-'+build+'-issues.json',JSON.stringify({issues,external}));
    await context.close();
  }
}finally{await b.close();}
