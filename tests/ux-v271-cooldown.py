import asyncio,re
from pathlib import Path
from playwright.async_api import async_playwright
P=Path(__file__).resolve().parent.parent
mock=(P/'tests'/'rejoin-game-browser.py').read_text().split("setup=r'''",1)[1].split("'''",1)[0].replace('const c=new Eventer();c.open', 'const c=new Eventer();window.__qaConn=c;c.open')
async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':390,'height':844},has_touch=True,is_mobile=True)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  raw=(P/'index.html').read_text()
  raw=re.sub(r'<script[^>]*src="[^"]+"[^>]*></script>','',raw)
  raw=re.sub(r'<link[^>]+href="(?:https?:[^"]+|style.css[^"]*)"[^>]*>','',raw)
  raw=raw.replace('</head>','<style>'+(P/'style.css').read_text()+'</style></head>')
  await page.evaluate(mock);await page.set_content(raw,wait_until='domcontentloaded')
  for f in ['i18n','peer','draw','terrain','world-art-v19','scenery','flora','props','worldfx','obstacles','interactive-obstacles','physics','sound','emote-layout','game']:
   await page.add_script_tag(content=(P/'js'/(f+'.js')).read_text())
  await page.locator('#btn-rejoin').click();await page.wait_for_timeout(550)
  assert await page.evaluate('document.body.dataset.screen')=='race'
  assert await page.locator('.jump-label,.sprint-label').count()==0
  cd=page.locator('#sprint-cd')
  assert await cd.inner_text()==''
  assert await cd.is_visible()==False
  start=await page.evaluate('performance.now()')
  async def send(n,charge,on):
   data={'type':'snap','ts':start+n*110,'racers':[{'id':'old-player-id','x':600+n*5,'y':300,'fwX':690+n*5,'fwY':300,'fwAngle':0,'rwX':510+n*5,'rwY':300,'rwAngle':0,'angle':0,'jn':0,'ja':0,'vx':7,'sp':charge,'so':int(on),'finished':False}]}
   await page.evaluate('d=>window.__qaConn.emit("data",d)',data)
   await page.wait_for_timeout(60)
  await send(1,1,False)
  assert await cd.inner_text()=='' and not await cd.is_visible(), 'counter appears at start'
  assert await page.locator('#btn-sprint').evaluate("e=>getComputedStyle(e,'::before').opacity")=='0', 'recharge ring appears at start'
  await send(2,0.5,True)
  assert await cd.inner_text()=='' and not await cd.is_visible(), 'counter appears while sprint active'
  await send(3,0.25,False)
  assert await cd.inner_text()=='17', ('expected recharge 17 seconds, got',await cd.inner_text())
  assert await cd.is_visible(), 'counter invisible during cooldown'
  assert await page.locator('#btn-sprint').evaluate("e=>e.classList.contains('cool')"), 'cooldown class missing'
  await send(4,1,False)
  assert await cd.inner_text()=='' and not await cd.is_visible(), 'counter remains after recharge'
  assert not errors, errors
  await page.screenshot(path=str(P/'tests'/'ux-v271-390x844.png'))
  print('PASS V27.1: icon-only controls, no countdown at start, none during sprint, visible in cooldown, hidden when ready, no JS errors')
  await browser.close()
asyncio.run(main())
