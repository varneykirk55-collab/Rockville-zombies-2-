import {chromium,firefox,webkit} from 'playwright-core';
import {resolve} from 'node:path';
export async function browser(kind='chrome'){
  if(kind==='firefox') return firefox.launch({headless:true,...(process.env.QA_FIREFOX_SOFTWARE==='1'?{firefoxUserPrefs:{'webgl.force-enabled':true,'webgl.enable-webgl2':true,'webgl.disable-angle':true,'gfx.webrender.software':true}}:{})});
  if(kind==='webkit') return webkit.launch({headless:true});
  return chromium.launch({executablePath:resolve(kind==='edge'?'../edge/opt/microsoft/msedge/msedge':'../chrome-headless-shell-linux64/chrome-headless-shell'),headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--no-sandbox','--disable-audio-output','--no-proxy-server']});
}
export async function setup(b, options={}){
  const context=await b.newContext({viewport:{width:640,height:360},...options});
  const issues=[], external=[];
  await context.route('**/*',r=>{
    if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();
    external.push(r.request().url());return r.abort();
  });
  await context.addInitScript(()=>{
    Object.defineProperty(Navigator.prototype,'getGamepads',{value:()=>window.qaPad?[window.qaPad]:[]});
    window.qaContextLoss=0;
    addEventListener('webglcontextlost',()=>window.qaContextLoss++,true);
    window.qaFrames=[];
    let prev;
    requestAnimationFrame(function observe(t){
      if(prev!==undefined) window.qaFrames.push(t-prev);
      if(window.qaFrames.length>3000)window.qaFrames.splice(0,500);
      prev=t;requestAnimationFrame(observe);
    });
  });
  const page=await context.newPage();
  page.on('pageerror',x=>issues.push(String(x)));
  page.on('console',x=>{if(x.type()==='error')issues.push(x.text());});
  page.on('crash',()=>issues.push('PAGE CRASH'));
  page.on('requestfailed',r=>{if(!['net::ERR_ABORTED','NS_BINDING_ABORTED'].includes(r.failure()?.errorText))issues.push(r.url()+' '+r.failure()?.errorText);});
  return {context,page,issues,external};
}
export const local='http://127.0.0.1:8930/';
export async function ready(page, audit=false){
  await page.waitForFunction(audit?()=>window.__ROCKVILLE__?.ready&&document.querySelector('#loading').hidden:()=>window.__ROCKVILLE__?.combat?.ready&&document.querySelector('#loading').hidden,null,{polling:170,timeout:180000});
}
