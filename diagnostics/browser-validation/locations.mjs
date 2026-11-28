// Lon/lat and heights are identical between the two builds.
// Field 5 is the camera's height above the local walking surface.
export const views={
  'town-square':[-77.15118,39.08607,-77.15169,39.08619,2.65,4.1],
  'regal-theater':[-77.14917,39.084035,-77.14965,39.083855,2.75,5.2],
  'maryland-avenue':[-77.15084,39.08538,-77.15098,39.08574,2.8,5],
  'east-montgomery-avenue':[-77.1500,39.08410,-77.15054,39.08411,2.5,4],
  'west-montgomery-avenue':[-77.15338,39.08385,-77.15252,39.08403,2.65,3],
  'gibbs-street':[-77.15188,39.08601,-77.15157,39.08612,2.45,4],
  'middle-lane':[-77.15065,39.08512,-77.15117,39.08513,2.7,3.4],
  'north-washington-street':[-77.15477,39.08710,-77.15462,39.08778,2.7,4],
  'south-washington-street':[-77.15338,39.08321,-77.15315,39.08396,2.7,4],
  'courthouse-square':[-77.15152,39.08311,-77.15151,39.083579,3.2,4],
  'historic-red-brick-courthouse':[-77.15135,39.0834,-77.15151,39.08358,3,8],
  'rockville-metro-station':[-77.14749,39.08467,-77.14672,39.08439,3.3,4],
  'choice-hotels-circle':[-77.14910,39.08611,-77.14920,39.08595,4,3.5],
  'dense-commercial':[-77.15039,39.08565,-77.15148,39.08585,2.6,4],
  'citywide-overview':[-77.15201,39.08324,-77.15049,39.08543,94,19],
};
export const measured=['town-square','regal-theater','maryland-avenue','gibbs-street','courthouse-square','rockville-metro-station','choice-hotels-circle','dense-commercial','citywide-overview'];
export async function prepareCamera(page){
  await page.evaluate(async()=>{
    const a=window.__ROCKVILLE__, {lonLatToWorld}=await import('./src/utils.js');
    window.qaCamera=(p,preset)=>{
      a.freeze(true);
      const sel=document.querySelector('#graphics-preset');
      if(sel.value!==preset){sel.value=preset;sel.dispatchEvent(new Event('change'));}
      const at=lonLatToWorld(p[0],p[1]), to=lonLatToWorld(p[2],p[3]);
      a.camera.position.set(at.x,a.sampleGround(at.x,at.z)+p[4],at.z);
      a.camera.lookAt(to.x,a.sampleGround(to.x,to.z)+p[5],to.z);
      a.camera.updateMatrixWorld();a.renderer.shadowMap.needsUpdate=true;
      return a.camera.position.toArray();
    };
  });
}
