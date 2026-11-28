import assert from 'node:assert/strict';
import {browser,setup,ready,local} from './browser.mjs';
import {writeFile} from 'node:fs/promises';
const b=await browser();
try{
 const {page,issues,external}=await setup(b,{viewport:{width:480,height:270}});
 await page.goto(local+'game/?audit=1');
 await ready(page,true);
 const result=await page.evaluate(()=>{
   const a=window.__ROCKVILLE__, audit=a.collisionAudit;
   const {crossings,failures,...summary}=audit;
   return {footprints:a.summary.rendered,modules:a.summary.modules,landmarks:a.frames.map(f=>f.id),
     audit:summary,counts:summary.counts,zeroChecks:{
       surface:summary.surfaceAreas.reduce((n,x)=>n+x.mismatches,0),
       wall:summary.counts['landmark-wall-gap']||0,
       road:summary.counts['road-center']||0,
       spawn:summary.counts['invalid-spawn']||0,
     }, totalCrossings:crossings.length,clearCrossings:crossings.filter(x=>x.clear).length,
     runtimeTextures:performance.getEntriesByType('resource').filter(x=>x.name.includes('/assets/environment/')).length};
 });
 assert.equal(result.footprints,743);assert.equal(result.landmarks.length,8);
 assert(Object.values(result.zeroChecks).every(x=>x===0));
 const webgl=await page.evaluate(()=>window.__ROCKVILLE__.renderer.getContext().getParameter(WebGL2RenderingContext.VERSION));
 await writeFile('../out/collision-audit.json',JSON.stringify({...result,webgl,issues,external},null,2));
 console.log(JSON.stringify({zeroChecks:result.zeroChecks,footprints:result.footprints,landmarks:result.landmarks.length,issues,external}));
}finally{await b.close();}
