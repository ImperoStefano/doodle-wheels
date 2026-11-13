import asyncio,re,base64
from pathlib import Path
from playwright.async_api import async_playwright
P=Path(__file__).resolve().parent.parent
old=(P/'tests'/'rejoin-game-browser.py').read_text()
mock=old.split("setup=r'''",1)[1].split("'''",1)[0]
async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--allow-file-access-from-files'])
  for W,H,land in [(390,844,False),(844,390,True),(360,740,False),(320,568,False),(1280,720,True)]:
   context=await browser.new_context(viewport={'width':W,'height':H},has_touch=True,is_mobile=W<900,device_scale_factor=1)
   page=await context.new_page()
   errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   raw=(P/'index.html').read_text()
   raw=re.sub(r'<script[^>]*src="[^"]+"[^>]*></script>','',raw)
   raw=re.sub(r'<link[^>]+href="(?:https?:[^"]+|style.css[^"]*)"[^>]*>','',raw)
   raw=raw.replace('</head>','<style>'+(P/'style.css').read_text()+'</style></head>')
   raw=re.sub(r'src="img/emotes/([a-z]+)\.png[^"]*"',lambda m:'src="data:image/png;base64,'+base64.b64encode((P/'img'/'emotes'/(m.group(1)+'.png')).read_bytes()).decode()+'"',raw)

   await page.evaluate(mock)
   await page.set_content(raw,wait_until='domcontentloaded')
   for f in ['i18n','peer','draw','terrain','world-art-v19','scenery','flora','props','worldfx','obstacles','interactive-obstacles','physics','sound','emote-layout','game']:
    await page.add_script_tag(content=(P/'js'/(f+'.js')).read_text())
   assert await page.evaluate("document.body.dataset.screen")=='menu'
   await page.locator('#btn-rejoin').click()
   await page.wait_for_timeout(650)
   assert await page.evaluate("document.body.dataset.screen")=='race',await page.evaluate('document.body.dataset.screen')
   # Reconnection uses local client racer; controls are still wired to host.
   result=await page.evaluate('''() => {
    const r=id=>{const x=document.querySelector(id).getBoundingClientRect(); return {x:x.left,y:x.top,w:x.width,h:x.height,right:x.right,bottom:x.bottom}};
    const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y));
    const jump=r('#btn-jump'),sprint=r('#btn-sprint'),emote=r('#btn-emote'),hud=r('.hud');
    return {jump,sprint,emote,hud,overlapJumpSprint:overlap(jump,sprint),overlapJumpEmote:overlap(jump,emote),overlapJumpHud:overlap(jump,hud),jumpLabel:document.querySelector('.jump-label').textContent,sprintLabel:document.querySelector('.sprint-label').textContent, selectedLen:document.querySelector('.seg-btn--on[data-len]').dataset.len}
   }''')
   assert result['selectedLen']=='corta',result
   assert result['jump']['w']>=80 and result['sprint']['w']>=55,result
   assert result['overlapJumpSprint']==0,result
   assert result['overlapJumpHud']==0,result
   assert result['overlapJumpEmote']==0,result
   assert result['jumpLabel'].lower()=='salta' and result['sprintLabel'].lower()=='scatto',result
   assert not errors,errors
   await page.screenshot(path=str(P/'tests'/f'ux-v27-{W}x{H}.png'))
   print('OK',W,H,'jump',result['jump']['w'],'sprint',result['sprint']['w'],'no overlap','errors',len(errors))
   await context.close()
  await browser.close()
asyncio.run(main())
