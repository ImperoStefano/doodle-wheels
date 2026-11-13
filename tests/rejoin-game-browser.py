import asyncio, re
from pathlib import Path
from playwright.async_api import async_playwright
P=Path(__file__).resolve().parent.parent
raw=(P/'index.html').read_text()
raw=re.sub(r'<script[^>]*src="[^"]+"[^>]*></script>','',raw)
raw=re.sub(r'<link[^>]+href="(?:https?:[^\"]+|style.css[^\"]*)"[^>]*>','',raw)
raw=raw.replace('</head>','<style>'+(P/'style.css').read_text()+'</style></head>')
jsfiles=['i18n','peer','draw','terrain','world-art-v19','scenery','flora','props','worldfx','obstacles','interactive-obstacles','physics','sound','emote-layout','game']
setup=r'''() => {
 const cache = {'dw_room_resume_v260': JSON.stringify({code:'ABCD',name:'Ste',token:'1234567890abcdef1234567890abcdef',at:Date.now()}),'dw_lang':'it'};
 Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>cache[k]??null,setItem:(k,v)=>cache[k]=v,removeItem:k=>delete cache[k]}});
 window.__stage='race';
 class Eventer { constructor(){this.events={}} on(k,f){(this.events[k] ||= []).push(f)} emit(k,d){(this.events[k]||[]).forEach(f=>f(d))} }
 window.Peer = class extends Eventer {
   constructor(){super();this.id='new-browser-peer';this.destroyed=false;setTimeout(()=>this.emit('open',this.id),20)}
   connect(){const c=new Eventer();c.open=true;c.peer='host';c.dataChannel={bufferedAmount:0};c.close=()=>{c.open=false;c.emit('close')};c.send=(m)=>{
       if(m.type==='join'){
         const verts=Array.from({length:16},(_,i)=>({x:Math.cos(i*2*Math.PI/16)*80,y:Math.sin(i*2*Math.PI/16)*80}));
         const players={'doodlewheels-ABCD':{id:'doodlewheels-ABCD',name:'Host',color:'#e8462a',isHost:true,connected:true},'old-player-id':{id:'old-player-id',name:'Ste',color:'#2b5fde',isHost:false,connected:true}};
         const stages={lobby:{type:'resumeState',stage:'lobby',code:'ABCD'},draw:{type:'resumeState',stage:'draw',code:'ABCD',deadline:Date.now()+22000},race:{type:'resumeState',stage:'race',code:'ABCD',wheels:{'doodlewheels-ABCD':verts,'old-player-id':verts},layout:['hills','ramps','water','ice','gravel','hills','ramps'],world:'paradise',crazy:false,np:2,startTime:Date.now()-25000,season:'classica',redraws:2}};
         stages.results = {...stages.race,stage:'results',standings:[{id:'doodlewheels-ABCD',name:'Host',color:'#e8462a',finished:true,finishTime:56000,distance:20000},{id:'old-player-id',name:'Ste',color:'#2b5fde',finished:true,finishTime:58000,distance:20000}]};
         setTimeout(()=>c.emit('data',{type:'welcome',id:'old-player-id',resumed:true,code:'ABCD'}),10);
         setTimeout(()=>c.emit('data',{type:'players',players}),20);
         setTimeout(()=>c.emit('data',stages[window.__stage]),30);
       }
     };setTimeout(()=>c.emit('open'),5);return c;
   }
   reconnect(){} destroy(){this.destroyed=true}
 }
}'''
async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for stage in ['lobby','draw','race','results']:
   page=await browser.new_page(viewport={'width':390,'height':844})
   errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.evaluate(setup)
   await page.set_content(raw,wait_until='domcontentloaded')
   for f in jsfiles:await page.add_script_tag(content=(P/'js'/(f+'.js')).read_text())
   await page.evaluate('stage=>window.__stage=stage',stage)
   await page.locator('#btn-rejoin').click()
   await page.wait_for_timeout(500)
   actual=await page.evaluate('document.body.dataset.screen')
   print('stage',stage,'actual',actual,'myId',await page.evaluate('Net.myId'),'errors',errors[:4])
   assert actual==stage,(actual,stage)
   assert await page.evaluate('Net.myId')=='old-player-id'
   assert not errors,errors
   if stage=='race':
    assert await page.locator('#race-canvas').is_visible()
    await page.screenshot(path=str(P/'tests'/'rejoin-race-mobile.png'))
   await page.close()
  await browser.close()
asyncio.run(main())
