import {browser,setup,ready,local} from './browser.mjs';
import {views,prepareCamera} from './locations.mjs';
import {mkdir,writeFile,access} from 'node:fs/promises';
const b=await browser();
await mkdir('../out/stills',{recursive:true});
async function save(page,path){
  const data=await page.evaluate(()=>{
    const a=window.__ROCKVILLE__;
    a.renderer.shadowMap.needsUpdate=true;
    a.renderer.render(a.scene,a.camera);
    return a.renderer.domElement.toDataURL('image/jpeg',0.93).split(',')[1];
  });
  await writeFile(path,Buffer.from(data,'base64'));
}
const file=name=>'../out/stills/Rockville_009_'+name+'.jpg';
try {
  const {page,context,issues,external}=await setup(b,{viewport:{width:960,height:540}});
  await page.goto(local+'game/?audit=1');
  await ready(page,true);
  await prepareCamera(page);
  await page.addStyleTag({content:'#graphics-settings{display:none!important}'});
  for(const [name,pose] of Object.entries({...views,'regal-marquee':[-77.14965,39.08366,-77.14965,39.08388,2.7,7],'town-square-clock-tower':[-77.15052,39.08505,-77.15052,39.08531,4,14]})){
    if(await access(file(name)).then(()=>true,()=>false))continue;
    const camera=await page.evaluate(p=>qaCamera(p,'high'),pose);
    await save(page,file(name));
    console.log('SHOT',name,camera);
  }
  for(const preset of ['low','medium','high']){
    await page.evaluate(({pose,preset})=>qaCamera(pose,preset),{pose:views['gibbs-street'],preset});
    await save(page,file('gibbs-preset-'+preset));
  }
  await context.close();
  const q=await setup(b,{viewport:{width:960,height:540}});
  await q.page.goto(local+'game/');
  await ready(q.page);
  await q.page.locator('#graphics-preset').selectOption('medium');
  await q.page.locator('#start').click();
  for(const [i,id] of ['m4','mk35','pistol'].entries()){
    await q.page.keyboard.press(String(i+1));
    await q.page.waitForFunction(id=>window.__ROCKVILLE__.combat.currentWeapon?.id===id&&!window.__ROCKVILLE__.combat.state.animation.drawing,id,{timeout:45000,polling:100});
    await save(q.page,file('weapon-'+id+'-base'));
    console.log('SHOT base',id);
  }
  // Separate screen capture fixture. These changes never run during the playtest.
  await q.page.evaluate(()=>{
    const a=window.__ROCKVILLE__;
    a.survival.update=()=>{};
  });
  for(const [i,id] of ['m4','mk35','pistol'].entries()){
    await q.page.keyboard.press(String(i+1));
    await q.page.waitForFunction(id=>window.__ROCKVILLE__.combat.currentWeapon?.id===id&&!window.__ROCKVILLE__.combat.state.animation.drawing,id);
    const upgraded=await q.page.evaluate(id=>{
      const c=window.__ROCKVILLE__.combat;c.setMachineBusy(true);
      const passed=c.upgradeWeapon(id);c.setMachineBusy(false);return passed;
    },id);
    if(!upgraded)throw Error('Weapon visual fixture failed '+id,{timeout:45000,polling:100});
    await save(q.page,file('weapon-'+id+'-upgraded-assisted'));
    console.log('SHOT upgraded',id);
  }
  for(const [name,z] of [['mystery-box',226],['pack-a-punch',234]]){
    await q.page.evaluate(z=>{
      const a=window.__ROCKVILLE__;
      a.freeze(true);
      a.camera.position.set(237,a.sampleGround(237,z+1)+2.35,z+1);
      a.camera.lookAt(232,a.sampleGround(232,z)+1.18,z);a.camera.updateMatrixWorld();
    },z);
    await save(q.page,file(name));
    console.log('SHOT',name);
  }
  await q.context.close();
  const zs=await setup(b,{viewport:{width:960,height:540}});
  await zs.page.goto(local+'game/');
  await ready(zs.page);
  await zs.page.locator('#start').click();
  await zs.page.waitForFunction(()=>window.__ROCKVILLE__.survival.state.alive>=3,null,{timeout:100000});
  for(const distance of ['close','medium']){
    await zs.page.evaluate(distance=>{
      const a=window.__ROCKVILLE__,p=a.camera.position.clone(),forward=p.clone();
      a.camera.getWorldDirection(forward);
      const roots=a.world.children.filter(o=>o.name==='Prisoner Zombie');
      for(const [i,o] of roots.entries()){
        const d=(distance==='close'?5.25:11.8)+i*1.12,s=(i-(roots.length-1)/2)*1.58;
        const x=p.x+forward.x*d+forward.z*s,z=p.z+forward.z*d-forward.x*s;
        o.position.set(x,a.sampleGround(x,z),z);o.visible=true;
      }
    },distance);
    await save(zs.page,file('zombies-'+distance+'-assisted'));
    console.log('SHOT',distance);
  }
  await writeFile('../out/capture-checks.json',JSON.stringify({audit:{issues,external},weapon:{issues:q.issues,external:q.external},zombies:{issues:zs.issues,external:zs.external}}));
}finally{await b.close();}
