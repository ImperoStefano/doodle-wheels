/* V27.2: deterministic unit test of the real jumpTry from physics.js.
 * This validates impulse rules, not complete Matter.js contact resolution. */
const fs=require('fs'), vm=require('vm'), assert=require('assert');
const src=fs.readFileSync(__dirname+'/../js/physics.js','utf8');
const s=src.indexOf('  const JUMP_V =');
const e=src.indexOf('  function sprintStep(',s);
assert(s>0&&e>s,'Real jump code not found');
const core=src.slice(s,e)+'\nObject.assign(exports,{ jumpTry });';
function test(name,opts,expected){
 const Terrain={INTERACTIVE_OBSTACLES:opts.obs||[],DYNAMIC_OBSTACLES:opts.dyn||[],zoneAt:()=>({})};
 const Matter={Body:{setVelocity:(b,v)=>{b.velocity={...v};}}};
 const scope={exports:{},Terrain,Matter};vm.createContext(scope);vm.runInContext(core,scope);
 const mk=(x)=>({position:{x},velocity:{x:opts.vx,y:opts.vy||0},gapNow:opts.air?65:0});
 const r={chassis:mk(1000),fw:mk(1050),rw:mk(950),dir:opts.dir||1,sc:1,jumpAt:-1e9,airJ:opts.air?1:0,lastGroundAt:opts.air?100:0};
 const done=scope.exports.jumpTry(r,1000);assert.equal(done,1,name+' jump accepted');
 const newV=r.chassis.velocity;
 assert(Math.abs(newV.x-expected.x)<.0001, name+': unexpected forward x '+newV.x+' vs '+expected.x);
 assert(Math.abs(newV.y-expected.y)<.0001, name+': y changed '+newV.y+' expected '+expected.y);
 for(const b of [r.fw,r.rw]){assert.equal(b.velocity.x,newV.x);assert.equal(b.velocity.y,newV.y);}
 console.log('PASS',name,'vx',newV.x,'vy',newV.y);
}
test('near obstacle slow forward',{vx:1.2,obs:[{x:1240}]},{x:4.7,y:-19.1});
test('clear road no launch',{vx:1.2,obs:[]},{x:1.2,y:-19.1});
test('full speed no launch',{vx:6.6,obs:[{x:1240}]},{x:6.6,y:-19.1});
test('obstacle far away no launch',{vx:1.2,obs:[{x:1700}]},{x:1.2,y:-19.1});
test('moving obstacle slow',{vx:2.8,dyn:[{x:1160}]},{x:5.8,y:-19.1});
test('reverse passage',{vx:-1.2,dir:-1,obs:[{x:790}]},{x:-4.7,y:-19.1});
test('air double jump no launch',{vx:1.2,air:true,obs:[{x:1200}]},{x:1.2,y:-18.145});
test('already rising not boosted too high',{vx:1.2,vy:-17.0,obs:[{x:1220}]},{x:4.7,y:-24.1});
console.log('PASS V27.2 all 8 jump unit scenarios');
