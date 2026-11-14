// Audit pendenze: nessuna salita "dopo il labbro" o su dossi/buche oltre la soglia. Esegui: node tests/slope-audit.cjs [n_piste]
const fs=require('fs'),vm=require('vm'),root=require('path').join(__dirname,'..');
const ctx={console,Math,performance:{now:()=>0},window:{},document:{},localStorage:{getItem(){return null},setItem(){}}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(root+'/js/terrain.js','utf8')+';globalThis.Terrain=Terrain;',ctx);
const T=ctx.Terrain,N=+process.argv[2]||300,LIMIT={default:45,arch:52,ravine:44,gapland:44},deg=a=>Math.atan(a)*180/Math.PI;
const worlds=['classic','paradise','inferno','atlantis','enchanted','neon','egypt'];let bad=0;
for(let i=0;i<N;i++){
  T.applyLayout(T.generateRandomLayout(15,i%5==0,null,worlds[i%7]),true);
  for(const z of T.ZONES)for(const p of(z.patches||[])){
    if(p.parts||p.kind==='pipe'||p.kind==='drop'||p.kind==='mud'||p.kind==='sand')continue;
    const st=p.u1!=null?p.a+p.u1+(p.ex||0)-2:p.a;let m=0;
    for(let x=st;x<=p.b;x+=2)m=Math.max(m,(T.height(x+20)-T.height(x-20))/40);
    const lim=LIMIT[p.kind]||LIMIT.default;
    if(deg(m)>lim){bad++;console.log('TROPPO RIPIDO',p.kind,deg(m).toFixed(0)+'°','>',lim);}
  }
}
if(bad){console.log(bad,'violazioni');process.exit(1);}console.log('OK slope audit su',N,'piste');
