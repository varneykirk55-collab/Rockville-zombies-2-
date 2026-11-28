import * as THREE from 'three';
import { DOWNTOWN, ROAD_CENTERLINES } from '../config.js';
import { lonLatToWorld } from '../utils.js';

const center = lonLatToWorld(DOWNTOWN.longitude, DOWNTOWN.latitude);
const town = lonLatToWorld(-77.15115, 39.08576);
const TILE = 128;
const COUNT = 8;
const streets = ROAD_CENTERLINES.flatMap(([, points]) => {
  const world = points.map(point => lonLatToWorld(...point));
  return world.slice(1).map((b, i) => [world[i], b]);
});

function frontageScore(edge) {
  const x = (edge.a.x + edge.b.x) / 2, z = (edge.a.z + edge.b.z) / 2;
  let best = Infinity;
  for (const [a, b] of streets) {
    if (x < Math.min(a.x, b.x) - 22 || x > Math.max(a.x, b.x) + 22 ||
        z < Math.min(a.z, b.z) - 22 || z > Math.max(a.z, b.z) + 22) continue;
    const dx = b.x - a.x, dz = b.z - a.z;
    const length = dx * dx + dz * dz;
    if (!length) continue;
    const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / length, 0, 1);
    const sx = a.x + t * dx - x, sz = a.z + t * dz - z;
    if (sx * edge.nx + sz * edge.nz < 1) continue;
    const distance = Math.hypot(sx, sz);
    if (distance <= 22) best = Math.min(best, distance - Math.min(24, edge.length) * 0.22);
  }
  return best;
}

function facadeAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = TILE * 4;
  canvas.height = TILE * 2;
  const ctx = canvas.getContext('2d');
  const palettes = ['#33423e','#423831','#243b43','#41474b','#75634d','#5c4c37','#6d7478','#737573'];
  const rect = (color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(x,y,w,h); };
  function pane(x,y,w,h,display) {
    rect('#14252b',x-2,y-2,w+4,h+4);
    const glass = ctx.createLinearGradient(x,y,x+w*.22,y+h);
    glass.addColorStop(0,'#7798a8');
    glass.addColorStop(.43,'#3e5960');
    glass.addColorStop(.62,'#283b3c');
    glass.addColorStop(1,display?'#716355':'#354349');
    ctx.fillStyle = glass;
    ctx.fillRect(x,y,w,h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x,y,w,h);
    ctx.clip();
    ctx.fillStyle = 'rgba(186,210,217,0.15)';
    ctx.beginPath();
    ctx.moveTo(x+w*.13,y);ctx.lineTo(x+w*.44,y);ctx.lineTo(x+w*.85,y+h);ctx.lineTo(x+w*.62,y+h);ctx.fill();
    ctx.restore();
  }
  for(let i=0;i<COUNT;i++){
    ctx.save();ctx.translate(i%4*TILE,Math.floor(i/4)*TILE);
    rect(palettes[i],0,0,TILE,TILE);
    if(i<4){
      rect('#181d1c',0,0,128,22);rect('#8c8a78',0,3,128,2);rect('#65695f',0,21,128,3);
      pane(7,31,69,79,true);
      pane(85,31,35,86,false);
      rect('#8a8b7c',40,29,2,85);rect('#a3a393',4,58,73,2);
      rect('#a4a296',89,78,2,16);rect('#292925',4,113,73,8);rect('#b5ada0',0,122,128,6);
      ctx.fillStyle='#d4cfc1';ctx.font='bold 9px sans-serif';ctx.textAlign='center';
      ctx.fillText(['SHOPFRONT','MAIN ENTRANCE','RETAIL','LOBBY'][i],64,16);
    }else if(i<7){
      rect('#b9b19f',0,0,128,9);rect('#3d3e38',9,12,110,112);
      pane(12,15,50,104,false);pane(66,15,50,104,false);
      rect('#aaa394',58,80,3,18);rect('#aaa394',67,80,3,18);
      rect('#8b897c',9,48,110,2);rect('#a9a89d',0,124,128,4);
    }else{
      rect('#4e514f',0,0,128,128);rect('#9b9d92',0,10,128,27);
      rect('#74766c',0,37,128,13);rect('#60645b',0,70,128,38);rect('#a7a99c',0,108,128,12);
    }
    ctx.restore();
  }
  const map=new THREE.CanvasTexture(canvas);
  map.colorSpace=THREE.SRGBColorSpace;
  map.anisotropy=4;
  return map;
}

function wallSupport(group) {
  const cells = new Map();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ray = new THREE.Ray(), hit = new THREE.Vector3();
  const cell = (x, z) => Math.floor(x / 12) + ',' + Math.floor(z / 12);
  for (const mesh of group.children) {
    if (!mesh.name.startsWith('Walls ')) continue;
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i += 3) {
      a.fromBufferAttribute(positions, i);
      b.fromBufferAttribute(positions, i+1);
      c.fromBufferAttribute(positions, i+2);
      for (let x = Math.floor(Math.min(a.x,b.x,c.x)/12); x <= Math.floor(Math.max(a.x,b.x,c.x)/12); x++) {
        for (let z = Math.floor(Math.min(a.z,b.z,c.z)/12); z <= Math.floor(Math.max(a.z,b.z,c.z)/12); z++) {
          const key = x + ',' + z;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push([positions, i]);
        }
      }
    }
  }
  return (edge, x, y, z) => {
    ray.origin.set(x+edge.nx*.11, y, z+edge.nz*.11);
    ray.direction.set(-edge.nx, 0, -edge.nz);
    return (cells.get(cell(x,z)) ?? []).some(([points, i]) => {
      a.fromBufferAttribute(points, i);
      b.fromBufferAttribute(points, i+1);
      c.fromBufferAttribute(points, i+2);
      return ray.intersectTriangle(a,b,c,true,hit) && ray.origin.distanceToSquared(hit) < .0196;
    });
  };
}

export function addFrontages(group, edges, flashing, mounting, ground) {
  const tiles = new Map();
  const fronts = new Map();
  let strips = 0, openings = 0;
  const supported = wallSupport(group);
  function panel(edge, start, end, bottom, top, tile) {
    if (end - start < .2 || top <= bottom) return;
    const dx=(edge.b.x-edge.a.x)/edge.length, dz=(edge.b.z-edge.a.z)/edge.length;
    for (const t of [0.08, 0.5, 0.92]) {
      const at = start + (end-start)*t;
      const px=edge.a.x+dx*at, pz=edge.a.z+dz*at;
      if (!supported(edge,px,(bottom+top)*.5,pz)) return false;
    }
    const {x,z}=edge.a;
    const key=Math.floor(x/120)+','+Math.floor(z/120);
    if(!tiles.has(key)) tiles.set(key,{position:[],normal:[],uv:[]});
    const batch=tiles.get(key);
    function vertex(length,y,s,t) {
      batch.position.push(x+dx*length,y,z+dz*length);
      batch.normal.push(edge.nx,0,edge.nz);
      batch.uv.push((tile%4+s*.97+.015)/4,(1-Math.floor(tile/4)+t*.94+.03)/2);
    }
    vertex(start,bottom,0,0);
    if (-dz*edge.nx+dx*edge.nz >= 0) {
      vertex(end,bottom,1,0);vertex(end,top,1,1);
      vertex(start,bottom,0,0);vertex(end,top,1,1);vertex(start,top,0,1);
    } else {
      vertex(end,top,1,1);vertex(end,bottom,1,0);
      vertex(start,bottom,0,0);vertex(start,top,0,1);vertex(end,top,1,1);
    }
    return true;
  }

  for (const edge of edges) {
    if (edge.role !== 'playable' || edge.length < 5 || !mounting.has(edge)) continue;
    const x=(edge.a.x+edge.b.x)/2,z=(edge.a.z+edge.b.z)/2;
    if (Math.hypot(x-center.x,z-center.z)>305) continue;
    const score=frontageScore(edge);
    if (score >= (fronts.get(edge.id)?.score ?? Infinity)) continue;
    fronts.set(edge.id,{edge,score,commercial:Math.hypot(x-town.x,z-town.z)<142 ||
      /MONTGOMERY AVE|MIDDLE LN|MARYLAND AVE|GIBBS ST/i.test(edge.address ?? '')});
  }

  // Only add flashing to wall segments that survived the party-wall pass.
  for(const edge of flashing) {
    if (panel(edge,0,edge.length,edge.top-.19,edge.top-.025,7)) strips++;
  }

  for (const {edge,commercial} of fronts.values()) {
    const bays=commercial ? Math.min(6,Math.max(1,Math.floor(edge.length/4.3))) : 1;
    const spacing=edge.length/(bays+1);
    const width=commercial ? Math.min(4.35,spacing*.84) : 1.9;
    for(let i=1;i<=bays;i++){
      const t=spacing*i/edge.length;
      const x=edge.a.x+(edge.b.x-edge.a.x)*t,z=edge.a.z+(edge.b.z-edge.a.z)*t;
      const y=ground(x,z)+.055;
      const top=commercial ? y+2.85 : y+2.26;
      if(top>edge.topOf(x,z)-.18)continue;
      const left = spacing * i - width / 2, right = spacing * i + width / 2;
      // A doorway must be fully backed by an emitted wall quad. Survey
      // footprints also contain hidden party walls and raised shell pieces.
      if (!mounting.get(edge).some(span =>
        left >= span.start && right <= span.end && y >= span.bottom - .04 && top <= span.top - .05)) continue;
      const style=commercial ? (edge.id+i*3)%4 : 4+edge.id%3;
      if (panel(edge,left,right,y,top,style)) openings++;
    }
  }

  const mat=new THREE.MeshStandardMaterial({map:facadeAtlas(),roughness:.81,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  for(const tile of tiles.values()){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(tile.position,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(tile.normal,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(tile.uv,2));
    const mesh=new THREE.Mesh(geometry,mat);
    mesh.name='Street-facing entrances and facade trim';
    mesh.receiveShadow=true;
    group.add(mesh);
  }
  return {openings,strips};
}
