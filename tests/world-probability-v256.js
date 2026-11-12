'use strict';
// Tests the actual WORLD_CHANCES table and drawWorld() function from js/game.js,
// not a separately reimplemented distribution.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const src=fs.readFileSync(__dirname+'/../js/game.js','utf8');
const found=src.match(/const WORLD_CHANCES\s*=\s*(\{[^}]+\});\s*function drawWorld\(\)\s*\{([\s\S]*?)\n  \}\n  els\.modePicker/);
assert(found,'Could not extract the game world draw function');
const chances=vm.runInNewContext('('+found[1]+')');
assert.deepEqual(Object.keys(chances),['paradise','inferno','atlantis','enchanted','neon']);
assert(Object.values(chances).every(v=>Math.abs(v-0.10)<1e-10));
assert(Math.abs(Object.values(chances).reduce((a,b)=>a+b,0)-0.5)<1e-10);
const points=[
 [0,'paradise'],[0.0999999,'paradise'],
 [0.1,'inferno'],[0.1999999,'inferno'],
 [0.2,'atlantis'],[0.2999999,'atlantis'],
 [0.3,'enchanted'],[0.3999999,'enchanted'],
 [0.4,'neon'],[0.4999999,'neon'],
 [0.5,'classic'],[0.999999,'classic']
];
for(const [r,expected] of points){
 const c={Math:Object.create(Math), location:{search:''},URLSearchParams};
 c.Math.random=()=>r;
 const actual=vm.runInNewContext('const WORLD_CHANCES='+found[1]+';function drawWorld(){'+found[2]+'\n}drawWorld()',c);
 assert.equal(actual,expected,`random=${r}`);
}
for(const world of Object.keys(chances)){
 const c={Math,location:{search:'?testWorld='+world},URLSearchParams};
 const actual=vm.runInNewContext('const WORLD_CHANCES='+found[1]+';function drawWorld(){'+found[2]+'\n}drawWorld()',c);
 assert.equal(actual,world,'testWorld force '+world);
}
console.log(JSON.stringify({status:'PASS',specialProbability:0.5,classicProbability:0.5,perWorld:chances,boundaryTests:points.length,overrideTests:Object.keys(chances).length},null,2));
