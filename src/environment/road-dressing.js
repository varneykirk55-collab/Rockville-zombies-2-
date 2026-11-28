import * as THREE from 'three';
import { ROAD_CENTERLINES } from '../config.js';
import { lonLatToWorld } from '../utils.js';

const corridors = [
  { x:197, z:211, reach:75, kind:'double' }, // E Montgomery Avenue
  { x:34, z:214, reach:50, kind:'double' },  // Downtown Montgomery Avenue
  { x:92, z:287, reach:50, kind:'double' },  // Maryland Avenue
  { x:400, z:179, reach:68, kind:'divided' }, // Rockville Pike at Metro
  { x:-241, z:-95, reach:63, kind:'double' }, // Washington Street
];
const intersections = [[89,211],[171,211],[251,211],[83,100]];
const crosswalks = [[89,203,0,1,7],[89,221,0,1,7],[171,200,0,1,6]];
const streetPaths = ROAD_CENTERLINES.map(([width, points]) =>
  ({ width, points:points.map(v=>lonLatToWorld(...v)) }));

function tessellate(terrain, vertices, lift) {
  const points=terrain.drapeTriangles(vertices,lift);
  if(!points.length) return null;
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  g.computeVertexNormals();
  return g;
}

export function addRoadDetails(world, terrain, solid) {
  const white=[],yellow=[],repairs=[],curbs=[],metal=[];
  const stats={laneSegments:0,stopBars:0,crosswalkStripes:0,curbs:0,utilities:0,patches:0,arrows:0};
  function shape(target,x,z,tx,tz,along,across) {
    const nx=tz,nz=-tx;
    const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>
      [x+a*tx*along/2+b*nx*across/2,0,z+a*tz*along/2+b*nz*across/2]);
    if(corners.some(([px,,pz])=>solid(px,pz)||!terrain.insidePlayable(px,pz)))return false;
    for(const i of [0,1,2,0,2,3])target.push(...corners[i]);
    return true;
  }
  const segments=new Set();
  for(const {x,z,reach,kind} of corridors){
    for(const {width,points} of streetPaths){
      if(width<4.05 || (kind==='divided'&&width<5))continue;
      for(let i=1;i<points.length;i++){
        const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
        if(len<12)continue;
        const t=THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(len*len),0,1);
        if(Math.hypot(a.x+t*dx-x,a.z+t*dz-z)>12)continue;
        const uid=[a.x,a.z,b.x,b.z].join(',');
        if(segments.has(uid))continue;
        segments.add(uid);
        const tx=dx/len,tz=dz/len;
        const margin=Math.max(7,t*len-reach),end=Math.min(len-7,t*len+reach);
        for(let d=margin;d<end;d+=8.5){
          const px=a.x+tx*d,pz=a.z+tz*d;
          if(intersections.some(([jx,jz])=>Math.hypot(px-jx,pz-jz)<17))continue;
          const center=kind==='divided'?white:yellow;
          const offsets=kind==='divided'?[0]:[-.15,.15];
          for(const offset of offsets)if(shape(center,px+tz*offset,pz-tx*offset,tx,tz,kind==='divided'?2.85:8.48,.11))stats.laneSegments++;
          for(const side of [-1,1]){
            const offset=side*(width+.045);
            if(shape(curbs,px+tz*offset,pz-tx*offset,tx,tz,8.47,.15))stats.curbs++;
          }
        }
        for(let d=margin+16;d<end;d+=38){
          const px=a.x+tx*d,pz=a.z+tz*d;
          if(shape(repairs,px+tz*.95,pz-tx*.95,tx,tz,2.15,.58))stats.patches++;
          const edge=width-.22;
          if(shape(metal,px+tz*edge,pz-tx*edge,tx,tz,.40,.25))stats.utilities++;
        }
        if(margin>8||end<len-8||kind==='divided')continue;
        for(const [dist,side] of [[7,1],[len-7,-1]]){
          const px=a.x+tx*dist+tz*side*width/2,pz=a.z+tz*dist-tx*side*width/2;
          if(intersections.some(([jx,jz])=>Math.hypot(px-jx,pz-jz)<11)&&
            shape(white,px,pz,tx,tz,.29,width-.35))stats.stopBars++;
        }
      }
    }
  }
  for(const [x,z,tx,tz,count] of crosswalks){
    for(let i=0;i<count;i++){
      const side=(i-(count-1)/2)*.87;
      if(shape(white,x+tz*side,z-tx*side,tx,tz,2.12,.38))stats.crosswalkStripes++;
    }
  }
  for(const [x,z,tx,tz] of [[156,212,1,0],[224,210,-1,0],[92,270,0,-1]]){
    if(!shape(white,x,z,tx,tz,1.72,.17))continue;
    const arrow=[
      [x+1.43*tx,0,z+1.43*tz],
      [x+.56*tx+tz*.43,0,z+.56*tz-tx*.43],
      [x+.56*tx-tz*.43,0,z+.56*tz+tx*.43],
    ];
    if(arrow.some(([px,,pz])=>solid(px,pz)))continue;
    white.push(...arrow.flat());
    stats.arrows++;
  }
  for(const [x,z] of [[187,210],[230,211],[90,277],[88,247],[409,193]]){
    const radius=.31;
    if(solid(x,z)||!terrain.insidePlayable(x,z))continue;
    for(let i=0;i<10;i++){
      const a=i*Math.PI/5,b=(i+1)*Math.PI/5;
      metal.push(x,0,z,x+Math.cos(a)*radius,0,z+Math.sin(a)*radius,
        x+Math.cos(b)*radius,0,z+Math.sin(b)*radius);
    }
    stats.utilities++;
  }
  function mesh(name,base,vertices,lift,color){
    const geometry=tessellate(terrain,vertices,lift);
    if(!geometry)return;
    const material=new THREE.MeshStandardMaterial({...base,color,side:THREE.DoubleSide});
    const detail=new THREE.Mesh(geometry,material);
    detail.name=name;
    detail.receiveShadow=true;world.add(detail);
  }
  mesh('White pavement markings',{roughness:.93},white,.057,0xc8c5b8);
  mesh('Amber pavement markings',{roughness:.92},yellow,.057,0xc8a14a);
  mesh('Low-profile curb edges',{roughness:.96},curbs,.055,0x9c9588);
  mesh('Asphalt patching',{roughness:.99},repairs,.055,0x68665d);
  mesh('Drain and manhole covers',{roughness:.68,metalness:.42},metal,.058,0x454747);
  return stats;
}
