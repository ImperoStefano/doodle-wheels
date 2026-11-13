import asyncio,re
from pathlib import Path
from playwright.async_api import async_playwright
P=Path(__file__).resolve().parent.parent
old=(P/'tests'/'rejoin-game-browser.py').read_text()
mock=old.split("setup=r'''",1)[1].split("'''",1)[0].replace('const c=new Eventer();c.open', 'const c=new Eventer();window.__fakeConn=c;c.open')
async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':390,'height':844},has_touch=True,is_mobile=True)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  raw=(P/'index.html').read_text();raw=re.sub(r'<script[^>]*src="[^"]+"[^>]*></script>','',raw);raw=re.sub(r'<link[^>]+href="(?:https?:[^\"]+|style.css[^\"]*)"[^>]*>','',raw)
  raw=raw.replace('</head>','<style>'+(P/'style.css').read_text()+'</style></head>')
  await page.evaluate(mock);await page.set_content(raw,wait_until='domcontentloaded')
  for f in ['i18n','peer','draw','terrain','world-art-v19','scenery','flora','props','worldfx','obstacles','interactive-obstacles','physics','sound','emote-layout','game']:
   await page.add_script_tag(content=(P/'js'/(f+'.js')).read_text())
  await page.locator('#btn-rejoin').click();await page.wait_for_timeout(440)
  assert await page.evaluate('document.body.dataset.screen')=='race'
  await page.evaluate('''() => {window.__sent=[];Net.send=m=>window.__sent.push(m);}''')
  await page.locator('#btn-jump').dispatch_event('pointerdown',{'pointerType':'touch','isPrimary':True,'button':0})
  assert await page.evaluate("window.__sent.some(x=>x.type==='jump')"),'jump was not sent immediately'
  assert not await page.locator('#btn-jump').evaluate("e=>e.classList.contains('jump-confirmed')"),'confirmed on tap instead of host snapshot'
  def snap(jn, ts):
    return {'type':'snap','ts':ts,'racers':[{'id':'old-player-id','x':500,'y':340,'fwX':590,'fwY':340,'fwAngle':0,'rwX':410,'rwY':340,'rwAngle':0,'angle':0,'jn':jn,'ja':0,'vx':7,'sc':1,'sp':1,'finished':False}]}
  t=await page.evaluate('performance.now()')
  await page.evaluate('m=>window.__fakeConn.emit("data",m)',snap(0,t+1));await page.wait_for_timeout(100)
  assert not await page.locator('#btn-jump').evaluate("e=>e.classList.contains('jump-confirmed')")
  await page.evaluate('m=>window.__fakeConn.emit("data",m)',snap(1,t+101));await page.wait_for_timeout(90)
  conf=await page.locator('#btn-jump').evaluate("e=>e.classList.contains('jump-confirmed')")
  assert conf,'host-accepted jump did not trigger feedback'
  await page.wait_for_timeout(240)
  assert not await page.locator('#btn-jump').evaluate("e=>e.classList.contains('jump-confirmed')"),'confirmation did not clear'
  # English translation must preserve SVG and show the correct label.
  await page.evaluate("I18n.set('en')")
  assert await page.locator('.jump-label').text_content()=='Jump'
  assert await page.locator('#btn-jump svg').count()==1
  assert await page.locator('.sprint-label').text_content()=='Sprint'
  assert not errors, errors
  print('PASS jump immediate request; confirmation only on host snapshot; 210ms clear; IT/EN labels; no JS errors')
  await browser.close()
asyncio.run(main())
