/* Deterministic logic test with minimal body adapter; NOT a Matter.js physics test.
   Exercises queueing, independent cooldowns, state replication and the actual obstacle registry. */
'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const c=vm.createContext({console,Math,performance:{now:()=>0}});
const B=(x,y,o)=>({position:{x,y},angle:o.angle||0,velocity:{x:0,y:0},angularVelocity:0,friction:o.friction||0,label:o.label||'',...o});
const Matter={Bodies:{rectangle:(x,y,w,h,o)=>({...B(x,y,o),width:w,height:h}),circle:(x,y,r,o)=>({...B(x,y,o),circleRadius:r})},Body:{setPosition:(b,p)=>{b.position={...p}},setAngle:(b,a)=>{b.angle=a},setVelocity:(b,v)=>{b.velocity={...v}},setAngularVelocity:(b,v)=>{b.angularVelocity=v},scale:(b,sx,sy)=>{b.scaled=[sx,sy]}},Constraint:{create:o=>o},World:{add:(w,bs)=>w.bodies.push(...(Array.isArray(bs)?bs:[bs]))}};
c.Matter=Matter;
c.Terrain={height:()=>0,DYNAMIC_OBSTACLES:[],INTERACTIVE_OBSTACLES:[]};
for(const f of ['obstacles.js','interactive-obstacles.js'])vm.runInContext(fs.readFileSync(__dirname+'/../js/'+f,'utf8'),c,{filename:f});
const D=vm.runInContext('DynamicObstacles',c),I=vm.runInContext('InteractiveObstacles',c);
let cases=0;
const moving=['sunwheel','ashdrum','waterwheel','hayroll','choir','flowergate','icefang','magbar','bell','lightstep','meteor','hammer','jelly','branch','lift','piston','gate','log','shell','roller'];
for(const kind of moving){
 c.Terrain.DYNAMIC_OBSTACLES=[{kind,x:1450,id:0,period:4,phase:0,biome:'classic'}];
 const w={bodies:[]};D.mount(w);assert.equal(D.snapshot().length,1,kind+' mounted');
 for(let t=0;t<=2000;t+=125){D.update(t,[]);const p=D.pose(c.Terrain.DYNAMIC_OBSTACLES[0],t);assert(Number.isFinite(p.x)&&Number.isFinite(p.y),kind+' finite pose');cases++;}
}
c.Terrain.DYNAMIC_OBSTACLES=[];
c.Terrain.INTERACTIVE_OBSTACLES=[
 {id:0,kind:'spring',x:840,biome:'paradise'},
 {id:1,kind:'tilt',x:1700,biome:'classic'},
 {id:2,kind:'boulder',x:2400,biome:'enchanted'},
 {id:3,kind:'clam',x:3100,biome:'atlantis'}
];
const w={bodies:[]};I.mount(w);assert.equal(I.hostBodies.length,4);
const [spring,tilt,boulder,clam]=I.hostBodies;
assert.equal(spring.width,170);assert.equal(spring.position.y-spring.height/2,489);
assert(tilt.isSensor && tilt.isStatic,'tilt uses an unblocking contact sensor');
assert(spring.isSensor && spring.isStatic,'spring uses a contact sensor');
assert(!w.bodies.some(o=>/interactive-(tilt|spring)-ramp/.test(o.label||'')),'no rigid access ramps remain');
cases+=5;
function rider(x){const fw={label:'wheel',position:{x,y:447},velocity:{x:4,y:3}},rw={label:'wheel',position:{x:x-65,y:447},velocity:{x:4,y:3}},chassis={label:'chassis',position:{x,y:427},velocity:{x:4,y:2}};return {fw,rw,chassis,finished:false};}
const a=rider(835),b=rider(831);I.beforeStep(0,[a,b]);
I.contact(spring,a.fw,0);I.contact(spring,b.fw,0);I.afterStep(0,[a,b]);
for(const r of [a,b])for(const part of [r.fw,r.rw,r.chassis])assert(part.velocity.y<=-12.2,'independent spring launch');cases+=6;
a.fw.velocity={x:4,y:4};I.contact(spring,a.fw,120);I.afterStep(120,[a,b]);assert.equal(a.fw.velocity.y,4,'per-rider disarming prevents repeat');cases++;
const tiltBike=rider(1788);tiltBike.fw.velocity.y=0;I.beforeStep(800,[tiltBike]);I.contact(tilt,tiltBike.fw,800);I.afterStep(800,[tiltBike]);assert(tiltBike.fw.velocity.y<0,'tilt provides a gentle contact impulse');for(let n=0;n<20;n++)I.beforeStep(800+n*17,[tiltBike]);assert(Math.abs(I.snapshot()[1][3])>.012,'tilt leans under load');cases+=2;
I.beforeStep(500,[a,b]);assert.equal(I.snapshot()[0][4],0,'spring animation resets');cases++;
const d=rider(2375);d.fw.velocity={x:4.3,y:2};I.beforeStep(1300,[d]);I.contact(boulder,d.fw,1300);I.afterStep(1300,[d]);assert(d.fw.velocity.y<=-8,'seed vault assists front wheel');cases++;
const collision=I.snapshot();assert.equal(collision.length,4);I.receive(collision);I.clearClient();cases++;
console.log(JSON.stringify({result:'PASS',adapter:'minimal contract checks ONLY (not physical integration)',movingTypes:moving.length,interactiveTypes:I.hostBodies.length,assertions:cases},null,2));
