import {browser,setup,ready,local} from './browser.mjs';
import {writeFile} from 'node:fs/promises';
const b=await browser();
try{
  const {page,issues,external}=await setup(b,{viewport:{width:960,height:540}});
  await page.addInitScript(()=>{
    const native=window.requestAnimationFrame.bind(window);
    let time=0;
    const queue=[];
    window.requestAnimationFrame=cb=>window.qaManual?(queue.push(cb),queue.length):native(cb);
    window.qaBegin=()=>{time=performance.now()+50;window.qaManual=true;};
    window.qaQueued=()=>queue.length;
    window.qaStep=(n=1)=>{for(let i=0;i<n;i++){const next=queue.splice(0);time+=50;next.forEach(cb=>cb(time));}};
  });
  await page.goto(local+'game/?autostart');
  await ready(page);
  await page.evaluate(()=>{
    const a=window.__ROCKVILLE__,r=a.renderer, actual=r.render;
    r.render=()=>{};
    qaBegin();
    window.qaShow=()=>{
      r.shadowMap.needsUpdate=true;
      actual.call(r,a.scene,a.camera);
      return r.domElement.toDataURL('image/jpeg',0.94).split(',')[1];
    };
    window.qaKey=code=>document.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));
  });
  await page.waitForFunction(()=>qaQueued()>0,null,{polling:150,timeout:45000});
  const store=async (name,action,arg)=>{
    const pic=await page.evaluate(action,arg);
    await writeFile('../out/stills/Rockville_009_'+name+'.jpg',Buffer.from(pic,'base64'));
    console.log('SHOT',name);
  };
  const settings=await page.evaluate(()=>{
    const a=window.__ROCKVILLE__,sel=document.querySelector('#graphics-preset');
    sel.value='medium';sel.dispatchEvent(new Event('change'));
    for(let i=0;i<220&&a.survival.state.alive<3;i++)qaStep();
    window.qaVisualFoes=a.world.children.filter(x=>x.name==='Prisoner Zombie');
    a.survival.update=()=>{};
    for(const o of window.qaVisualFoes)o.visible=false;
    return {count:window.qaVisualFoes.length,weapon:a.combat.currentWeapon};
  });
  console.log('Fixture',settings);
  for(const [i,id] of ['m4','mk35','pistol'].entries()){
    for(const kind of ['base','upgraded-assisted']){
      await store('weapon-'+id+'-'+kind,({index,id,kind})=>{
        const c=window.__ROCKVILLE__.combat;
        qaKey('Digit'+(index+1));qaStep(24);
        if(c.currentWeapon.id!==id)throw Error('Wrong visual model '+c.currentWeapon.id);
        if(kind!=='base'){
          c.setMachineBusy(true);
          if(!c.upgradeWeapon(id))throw Error('Upgrade visual failed '+id);
          c.setMachineBusy(false);qaStep(7);
        }
        return qaShow();
      },{index:i,id,kind});
    }
  }
  for(const distance of ['close','medium']){
    await store('zombies-'+distance+'-assisted',distance=>{
      const a=window.__ROCKVILLE__,camera=a.camera,p=camera.position,f=p.clone();
      camera.getWorldDirection(f);
      if(window.qaVisualFoes.length<3)throw Error('Fewer than three zombie models available');
      window.qaVisualFoes.forEach((o,i)=>{
        const side=(i-(qaVisualFoes.length-1)/2)*1.3,d=(distance==='close'?5:12)+i*.9;
        const x=p.x+f.x*d+f.z*side,z=p.z+f.z*d-f.x*side;
        o.position.set(x,a.sampleGround(x,z),z);o.rotation.y=camera.rotation.y;o.visible=true;
      });
      return qaShow();
    },distance);
  }
  for(const [id,z] of [['mystery-box',226],['pack-a-punch',234]]){
    await store(id,z=>{
      const a=window.__ROCKVILLE__;
      const x=237,zz=z+(z===226?0.5:-0.8);
      a.camera.position.set(x,a.sampleGround(x,zz)+2.05,zz);
      a.camera.lookAt(232,a.sampleGround(232,z)+0.9,z);
      a.camera.updateMatrixWorld();
      return qaShow();
    },z);
  }
  await writeFile('../out/staged-capture-checks.json',JSON.stringify({issues,external}));
}finally{await b.close();}
