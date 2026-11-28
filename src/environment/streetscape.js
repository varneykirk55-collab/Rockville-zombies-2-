import * as THREE from 'three';
import { ROAD_CENTERLINES } from '../config.js';
import { createBuildingCollision } from '../camera.js';
import { lonLatToWorld } from '../utils.js';

// Site layouts use the same local metre grid as the county footprints.
// Public-space references inform the composition, and exact prop furniture
// dimensions and modelled placements are documented in Assignment 008.
const sites = [
  {
    name: 'Town Square and Gibbs Street',
    paving: [[14,-24,64,27,'brick']],
    trees: [[22,-20,5.3],[35,-20,5.7],[49,-20,5.1],[63,-20,5.5],[21,-1,4.8],[66,-1,4.9]],
    benches: [[28,-20,0],[42,-20,0],[57,-20,0]],
    beds: [[19,-20,2.7,1.3],[68,-19,2.6,1.3]],
    lights: [[18,0],[71,0]],
    signs: [[71,-4,'TOWN SQUARE','GIBBS STREET',1.55],[16,-4,'GIBBS STREET','EAST MIDDLE LANE',-1.55]],
    bins: [[24,-19],[63,-19]],
    racks: [[71,-16,0]],
    bollards: [[74,-23],[74,-2]],
  },
  {
    name: 'Courthouse Square',
    paving: [[65,235,16,51,'brick'],[56,230,24,3,'brick']],
    trees: [[65,247,5.9],[68,260,5.8],[66,272,5.4],[61,279,4.7],[54,291,4.5]],
    benches: [[64,244,Math.PI/2],[65,266,Math.PI/2]],
    beds: [[66,241,3.4,1.4],[67,277,3.4,1.4]],
    lights: [[76,238],[73,278]],
    signs: [[73,246,'COURTHOUSE SQUARE','HISTORIC DISTRICT',1.2]],
    bins: [[68,273]],
    hydrants: [[78,256]],
  },
  {
    name: 'Regal and East Montgomery',
    paving: [[227,221,18,24,'concrete']],
    trees: [[242,242,4.5],[244,231,4.1]],
    benches: [[239,244,Math.PI/2]],
    beds: [[242,241,1.4,2.2]],
    lights: [[243,237],[241,224]],
    signs: [[242,244,'REGAL','EAST MONTGOMERY AVENUE',1.58]],
    bins: [[240,245]],
    hydrants: [[202,201],[219,202],[244,217]],
    signals: [[161,201,0],[244,199,0]],
    utilities: [[239,250,Math.PI/2]],
  },
  {
    name: 'Metro west approach',
    paving: [[352,222,14,14,'concrete']],
    trees: [[348,229,4.8],[352,241,5.4]],
    lights: [[355,234],[382,199]],
    signs: [[355,231,'ROCKVILLE STATION','METRO / MARC / AMTRAK',.44],[462,208,'TRANSIT','ROCKVILLE STATION',-.65]],
    bins: [[355,230]],
    racks: [[353,232,0]],
    bus: [[467,228,-.64]],
    utilities: [[357,228,0]],
    bollards: [[366,226],[365,229]],
  },
  {
    name: 'Choice Hotels Circle',
    trees: [[256,10,4.4],[259,12,4.7]],
    beds: [[262,8,1.8,2.4]],
    lights: [[251,-1]],
    signs: [[263,4,'CHOICE HOTELS CIRCLE','ROCKVILLE PIKE',.88]],
  },
  {
    name: 'Washington Street',
    trees: [[-224,-146,5.9],[-221,-119,6.4],[-222,-96,5.9]],
    lights: [[-220,-115]],
    signs: [[-219,-116,'N WASHINGTON STREET','ROCKVILLE',1.35]],
  },
];

const roadSegments = ROAD_CENTERLINES.flatMap(([w, points]) => {
  const coords = points.map(p => lonLatToWorld(...p));
  return coords.slice(1).map((b,i)=>{
    const a=coords[i], dx=b.x-a.x,dz=b.z-a.z;
    return {a,dx,dz,w,len:Math.hypot(dx,dz)};
  }).filter(r=>r.len>.01);
});

function closestRoad(x,z) {
  let hit = null, distance = Infinity;
  for(const r of roadSegments){
    if (x < Math.min(r.a.x,r.a.x+r.dx)-26 || x > Math.max(r.a.x,r.a.x+r.dx)+26 ||
        z < Math.min(r.a.z,r.a.z+r.dz)-26 || z > Math.max(r.a.z,r.a.z+r.dz)+26) continue;
    const t=THREE.MathUtils.clamp(((x-r.a.x)*r.dx+(z-r.a.z)*r.dz)/(r.len*r.len),0,1);
    const sx=r.a.x+r.dx*t,sz=r.a.z+r.dz*t;
    const d=Math.hypot(x-sx,z-sz);
    if(d<distance){distance=d;hit={...r,sx,sz,t,d};}
  }
  return hit;
}

function signage(rows) {
  const canvas=document.createElement('canvas');
  const width=256,height=64,columns=4;
  canvas.width=width*columns;
  canvas.height=height*Math.ceil(rows.length/columns);
  const ctx=canvas.getContext('2d');
  rows.forEach((row,i)=>{
    const x=i%columns*width,y=Math.floor(i/columns)*height;
    ctx.fillStyle=i<3?'#30534b':'#253c49';ctx.fillRect(x,y,width,height);
    ctx.strokeStyle='#d9d4bb';ctx.lineWidth=2;ctx.strokeRect(x+4,y+4,width-8,height-8);
    ctx.textAlign='center';ctx.fillStyle='#ffffe9';
    ctx.font='bold 18px sans-serif';ctx.fillText(row[2],x+width/2,y+28,width-19);
    ctx.font='11px sans-serif';ctx.fillText(row[3],x+width/2,y+47,width-21);
  });
  const map=new THREE.CanvasTexture(canvas);
  map.colorSpace=THREE.SRGBColorSpace;
  return {map,columns,rows:canvas.height/height};
}

export function addStreetscape({world, terrain, maps, polygons}) {
  const group=new THREE.Group();
  group.name='Reference-based streetscape and landscaping';
  world.add(group);
  const blocked=createBuildingCollision(polygons);
  const stone=new THREE.MeshStandardMaterial({color:0x9c9583,roughness:.94});
  const earth=new THREE.MeshStandardMaterial({color:0x554335,roughness:1});
  const iron=new THREE.MeshStandardMaterial({color:0x35413d,roughness:.63,metalness:.41});
  const steel=new THREE.MeshStandardMaterial({color:0x5d655f,roughness:.56,metalness:.62});
  const oak=new THREE.MeshStandardMaterial({map:maps.wood,color:0x8c6b4c,roughness:.82});
  const lamp=new THREE.MeshStandardMaterial({color:0xe3d5ad,roughness:.51,emissive:0xb69454,emissiveIntensity:.17});
  const foliage=new THREE.MeshStandardMaterial({roughness:1});
  const bark=new THREE.MeshStandardMaterial({color:0x6d5140,roughness:1});
  const hydrantPaint=new THREE.MeshStandardMaterial({color:0x91514a,roughness:.66,metalness:.25});
  const signalLens=new THREE.MeshStandardMaterial({color:0x914640,roughness:.36,emissive:0x9d2924,emissiveIntensity:.36});
  const box=new THREE.BoxGeometry(1,1,1);
  const cylinder=new THREE.CylinderGeometry(.5,.65,1,8);
  const crown=new THREE.IcosahedronGeometry(1,2);
  const distantCrown=new THREE.IcosahedronGeometry(1,0);
  const leaves=crown.getAttribute('position');
  for(let i=0;i<leaves.count;i++) {
    const x=leaves.getX(i),y=leaves.getY(i),z=leaves.getZ(i);
    const lobe=1+Math.sin(x*12.9+z*6.4)*Math.cos(y*13.1-z*8.2)*.135;
    leaves.setXYZ(i,x*lobe,y*lobe,z*lobe);
  }
  crown.computeVertexNormals();
  const piles=new Map();
  const pavements=new Map();
  const approvedSigns=[];
  const stats={trees:0,beds:0,benches:0,lights:0,signs:0,bins:0,racks:0,bollards:0,shelters:0,hydrants:0,signals:0,utilities:0,colliders:0,paving:0};
  const furniture=[];
  const machineSites=[[232,226],[232,234]];
  function clear(x,z,r) {
    if(!terrain.insidePlayable(x,z) || machineSites.some(([a,b])=>Math.hypot(x-a,z-b)<7+r))return false;
    const road=closestRoad(x,z);
    if(road&&road.d<road.w+(road.w>=4?2:0)+r+.45)return false;
    for(const [dx,dz] of [[0,0],[r,0],[-r,0],[0,r],[0,-r],[r*.71,r*.71],[-r*.71,r*.71],[r*.71,-r*.71],[-r*.71,-r*.71]]){
      if(blocked(x+dx,z+dz))return false;
    }
    return furniture.every(([px,pz,pr])=>Math.hypot(x-px,z-pz)>r+pr+.55);
  }
  function occupy(x,z,w,d,yaw,height) {
    const sin=Math.sin(yaw),cos=Math.cos(yaw);
    const outer=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]]
      .map(([a,b])=>({x:x+a*cos+b*sin,z:z-a*sin+b*cos}));
    furniture.push([x,z,Math.hypot(w,d)/2]);
    polygons.push({outer,holes:[],source:'streetscape',maxY:terrain.sampleGameY(x,z)+height});
    stats.colliders++;
  }
  function part(geometry,material,x,y,z,w,h,d,yaw=0,tint=null,detail=false) {
    const cell=Math.floor(x/96)+','+Math.floor(z/96);
    const key=[geometry.id,material.id,cell,+detail].join('/');
    if(!piles.has(key))piles.set(key,{geometry,material,detail,items:[]});
    piles.get(key).items.push([x,y,z,w,h,d,yaw,tint]);
  }
  const cube=(m,x,y,z,w,h,d,yaw=0)=>part(box,m,x,y,z,w,h,d,yaw);
  function paving([x,z,w,d,type]) {
    const vertices=pavements.get(type)??[];
    pavements.set(type,vertices);
    let accepted=false;
    // One-metre edge strips avoid drawing masonry through adjoining walls.
    for(let a=x;a<x+w;a+=2)for(let b=z;b<z+d;b+=2){
      const c=Math.min(a+2,x+w),e=Math.min(b+2,z+d),mx=(a+c)*.5,mz=(b+e)*.5;
      const route=closestRoad(mx,mz);
      if(blocked(mx,mz)|| (route&&route.d<route.w+.9))continue;
      vertices.push(a,0,b,c,0,e,c,0,b,a,0,b,a,0,e,c,0,e);
      accepted=true;
    }
    if(accepted)stats.paving++;
  }
  for(const site of sites){
    for(const value of site.paving??[])paving(value);
    for(const [x,z,h] of site.trees??[]){
      if(!clear(x,z,.48))continue;
      const y=terrain.sampleGameY(x,z);
      const f=h/5; const tints=[0x657749,0x758651,0x526d42,0x668450,0x879360];
      part(cylinder,bark,x,y+h*.29,z,.25*f,h*.58,.25*f);
      for(const [ox,oy,oz,s,i] of [[0,.76,0,1.54,0],[-.9,.66,.1,1.03,1],[.88,.70,.36,.98,2],[.14,.88,-.62,.88,3],[-.36,.94,.22,.82,4]]){
        part(crown,foliage,x+ox*f,y+oy*h,z+oz*f,s*f,s*f*.93,s*f,ox,tints[i],true);
      }
      part(distantCrown,foliage,x,y+h*.75,z,2.15*f,1.83*f,1.78*f,0,tints[0]);
      occupy(x,z,.37*f,.37*f,0,h*.58);
      stats.trees++;
    }
    for(const [x,z,w,d] of site.beds??[]){
      if(!clear(x,z,Math.hypot(w,d)/2))continue;
      const y=terrain.sampleGameY(x,z);
      cube(stone,x,y+.14,z,w,.28,d);
      cube(earth,x,y+.28,z,w-.12,.04,d-.12);
      for(let i=0;i<5;i++){
        const t=(i+1)/6;
        part(crown,foliage,x+(t-.5)*w,y+.47,z+Math.sin(i*7)*d*.16,.29,.36,.36,i,0x6c8249);
      }
      occupy(x,z,w,d,0,.64);stats.beds++;
    }
    for(const [x,z,yaw] of site.benches??[]){
      if(!clear(x,z,1.16))continue;
      const y=terrain.sampleGameY(x,z);
      for(const dx of [-.66,.66]){
        cube(iron,x+dx*Math.cos(yaw),y+.23,z-dx*Math.sin(yaw),.10,.46,.43,yaw);
      }
      cube(oak,x,y+.46,z,1.96,.095,.46,yaw);
      cube(oak,x+Math.sin(yaw)*.19,y+.69,z+Math.cos(yaw)*.19,1.96,.30,.08,yaw);
      occupy(x,z,1.96,.52,yaw,.84);stats.benches++;
    }
    for(const [x,z] of site.lights??[]){
      if(!clear(x,z,.43))continue;
      const y=terrain.sampleGameY(x,z);
      part(cylinder,iron,x,y+2,z,.14,4,.14);
      part(cylinder,iron,x,y+.25,z,.27,.5,.27);
      cube(iron,x,y+4,z,.53,.12,.53);
      cube(lamp,x,y+3.87,z,.37,.24,.37);
      occupy(x,z,.29,.29,0,4.08);stats.lights++;
    }
    for(const [x,z] of site.bins??[]){
      if(!clear(x,z,.46))continue;
      const y=terrain.sampleGameY(x,z);
      part(cylinder,iron,x,y+.42,z,.54,.84,.54);
      part(cylinder,steel,x,y+.86,z,.56,.10,.56);
      occupy(x,z,.54,.54,0,.91);stats.bins++;
    }
    for(const [x,z,yaw] of site.racks??[]){
      if(!clear(x,z,1.23))continue;
      const y=terrain.sampleGameY(x,z);
      for(const dx of [-.6,0,.6]){
        const ax=x+Math.cos(yaw)*dx,az=z-Math.sin(yaw)*dx;
        for(const k of [-1,1])cube(steel,ax+Math.sin(yaw)*k*.24,y+.37,az+Math.cos(yaw)*k*.24,.052,.74,.052,yaw);
        cube(steel,ax,y+.74,az,.052,.06,.53,yaw);
      }
      occupy(x,z,1.32,.56,yaw,.77);stats.racks++;
    }
    for(const [x,z] of site.bollards??[]){
      if(!clear(x,z,.25))continue;
      const y=terrain.sampleGameY(x,z);
      part(cylinder,iron,x,y+.42,z,.20,.84,.20);
      part(cylinder,steel,x,y+.76,z,.21,.075,.21);
      occupy(x,z,.21,.21,0,.84);stats.bollards++;
    }
    for(const [x,z,yaw] of site.bus??[]){
      if(!clear(x,z,2.7))continue;
      const y=terrain.sampleGameY(x,z),sin=Math.sin(yaw),cos=Math.cos(yaw);
      for(const side of [-1,1])for(const rear of [-1,1]) {
        const px=x+side*1.38*cos+rear*.54*sin,pz=z-side*1.38*sin+rear*.54*cos;
        cube(iron,px,y+1.12,pz,.12,2.24,.12,yaw);
        occupy(px,pz,.16,.16,yaw,2.23);
      }
      cube(iron,x,y+2.24,z,3.18,.13,1.47,yaw);
      cube(oak,x+sin*.28,y+.46,z+cos*.28,2.2,.08,.40,yaw);
      occupy(x+sin*.28,z+cos*.28,2.2,.45,yaw,.50);stats.shelters++;
    }
    for(const [x,z] of site.hydrants??[]){
      if(!clear(x,z,.36))continue;
      const y=terrain.sampleGameY(x,z);
      part(cylinder,hydrantPaint,x,y+.29,z,.32,.58,.32);
      part(cylinder,steel,x,y+.61,z,.22,.09,.22);
      cube(hydrantPaint,x,y+.35,z,.48,.19,.20);
      occupy(x,z,.48,.33,0,.66);
      stats.hydrants++;
    }
    for(const [x,z,yaw] of site.utilities??[]){
      if(!clear(x,z,.74))continue;
      const y=terrain.sampleGameY(x,z);
      cube(steel,x,y+.57,z,.66,1.14,.47,yaw);
      cube(iron,x,y+.08,z,.76,.16,.57,yaw);
      occupy(x,z,.76,.57,yaw,1.14);
      stats.utilities++;
    }
    for(const [x,z,yaw] of site.signals??[]){
      if(!clear(x,z,.6))continue;
      const y=terrain.sampleGameY(x,z);
      part(cylinder,steel,x,y+1.94,z,.15,3.88,.15);
      cube(iron,x,y+3.74,z,.35,.86,.29,yaw);
      const sx=x+Math.sin(yaw)*.16,sz=z+Math.cos(yaw)*.16;
      for(let i=0;i<3;i++)cube(i===0?signalLens:steel,sx,y+3.99-i*.25,sz,.19,.16,.075,yaw);
      occupy(x,z,.28,.28,yaw,4.20);
      stats.signals++;
    }
    for(const value of site.signs??[]){
      const [x,z,,,yaw]=value;
      if(!clear(x,z,.66))continue;
      const y=terrain.sampleGameY(x,z);
      part(cylinder,iron,x,y+1.28,z,.11,2.56,.11);
      cube(iron,x,y+2.39,z,1.43,.41,.065,yaw);
      approvedSigns.push(value);occupy(x,z,.19,.19,0,2.61);stats.signs++;
    }
  }

  const obj=new THREE.Object3D(),color=new THREE.Color();
  const lodTiles=new Map();
  for(const {geometry,material,detail,items} of piles.values()){
    const mesh=new THREE.InstancedMesh(geometry,material,items.length);
    mesh.name='Batched environmental details';
    items.forEach(([x,y,z,w,h,d,yaw,tint],i)=>{
      obj.position.set(x,y,z); obj.rotation.set(0,yaw,0);obj.scale.set(w,h,d);obj.updateMatrix();
      mesh.setMatrixAt(i,obj.matrix);
      if(tint!==null)mesh.setColorAt(i,color.setHex(tint));
    });
    mesh.receiveShadow=true;
    mesh.computeBoundingSphere();
    if((geometry===crown&&detail) || geometry===distantCrown){
      const [x,,z]=items[0],key=Math.floor(x/96)+','+Math.floor(z/96);
      const tile=lodTiles.get(key)??{};
      tile[detail?'near':'far']=mesh;
      lodTiles.set(key,tile);
    }else group.add(mesh);
  }
  for(const {near,far} of lodTiles.values()){
    const center=near.boundingSphere.center;
    const lod=new THREE.LOD();lod.position.copy(center);
    near.position.copy(center).negate();far.position.copy(center).negate();
    lod.addLevel(near,0,.12);lod.addLevel(far,105,.12);
    group.add(lod);
  }

  if(approvedSigns.length){
    const {map,columns,rows}=signage(approvedSigns);
    const material=new THREE.MeshStandardMaterial({map,roughness:.77,side:THREE.DoubleSide});
    const position=[],normal=[],uv=[];
    approvedSigns.forEach(([x,z,,,yaw],i)=>{
      const y=terrain.sampleGameY(x,z)+2.39,nx=Math.sin(yaw),nz=Math.cos(yaw);
      const tx=Math.cos(yaw),tz=-Math.sin(yaw);
      for(const s of [-1,1])for(const [a,b] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]){
        const h=(s>0?a:1-a)-.5;
        position.push(x+tx*h*1.4+nx*s*.036,y+(b-.5)*.38,z+tz*h*1.4+nz*s*.036);
        normal.push(nx*s,0,nz*s);
        uv.push((i%columns+a*.97+.015)/columns,(rows-1-Math.floor(i/columns)+b*.96+.02)/rows);
      }
    });
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    group.add(new THREE.Mesh(g,material));
  }

  for(const [type,verts] of pavements){
    if(!verts.length)continue;
    const positions=terrain.drapeTriangles(verts,.065),normals=[],uv=[];
    for(let i=0;i<positions.length;i+=3){
      normals.push(0,1,0);uv.push(positions[i]/2,positions[i+2]/2);
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({...maps[type],color:type==='brick'?0xc8ab93:0xd0c8b8}));
    mesh.name='Draped plaza pavement';mesh.receiveShadow=true;group.add(mesh);
  }
  return stats;
}
