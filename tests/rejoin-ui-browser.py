import asyncio,re
from pathlib import Path
from playwright.async_api import async_playwright
P=Path(__file__).resolve().parent.parent
async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  raw=(P/'index.html').read_text()
  raw=re.sub(r'<script[^>]*src="[^"]+"[^>]*></script>','',raw)
  raw=re.sub(r'<link[^>]+href="(?:https?:[^\"]+|style.css[^\"]*)"[^>]*>','',raw)
  raw=raw.replace('</head>', '<style>'+ (P/'style.css').read_text()+'</style></head>')
  for w,h in [(390,844),(375,667),(1280,720)]:
   page=await browser.new_page(viewport={'width':w,'height':h})
   page_errors=[];page.on('pageerror',lambda e:page_errors.append(str(e)))
   await page.evaluate('''() => {
     const cache={'dw_room_resume_v260':JSON.stringify({code:'ABCD',name:'Ste',token:'1234567890abcdef1234567890abcdef',at:Date.now()})};
     Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>cache[k]??null,setItem:(k,v)=>cache[k]=v,removeItem:k=>delete cache[k]}});
   }''')
   await page.set_content(raw,wait_until='domcontentloaded')
   for f in ['i18n','peer','draw','terrain','world-art-v19','scenery','flora','props','worldfx','obstacles','interactive-obstacles','physics','sound','emote-layout','game']:
    await page.add_script_tag(content=(P/'js'/(f+'.js')).read_text())
   await page.wait_for_timeout(500)
   btn=page.locator('#btn-rejoin')
   print(w,h,'visible',await btn.is_visible(),'label',await btn.inner_text(),'name',await page.locator('#input-name').input_value(),'code',await page.locator('#input-code').input_value(),'errors',page_errors[:3])
   assert await btn.is_visible()
   assert 'ABCD' in await btn.inner_text()
   assert await page.locator('#input-name').input_value()=='Ste'
   assert not page_errors, page_errors
   await page.screenshot(path=str(P/'tests'/f'rejoin-ui-{w}.png'),full_page=True)
   await page.close()
  await browser.close()
asyncio.run(main())
