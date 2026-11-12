from playwright.sync_api import sync_playwright
from pathlib import Path
import re
root=Path('/mnt/data/dw_v256_release')
with sync_playwright() as p:
  browser=p.chromium.launch(executable_path="/usr/bin/chromium",headless=True,args=['--disable-web-security','--allow-file-access-from-files','--no-sandbox'])
  fails=[]
  for width,height in [(390,667),(360,620),(844,390),(1280,720)]:
    page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
    html=(root/'index.html').read_text()
    html=re.sub(r'<script[^>]*src="[^"]*"[^>]*></script>', '',html)
    html=re.sub(r'<link[^>]+rel="stylesheet"[^>]*>', lambda m: '<style>'+(root/'style.css').read_text()+'</style>', html)
    page.set_content(html,wait_until='domcontentloaded')
    for name in ['menu','lobby','draw','results']:
      page.evaluate('''(name)=>{document.body.dataset.screen=name;document.querySelectorAll('.screen').forEach(e=>e.classList.toggle('screen--active', e.id==='screen-'+name));}''',name)
      # Generate tall content in the lobby to match 5 players + 3 settings.
      if name=='lobby':
        page.evaluate('''()=>{document.getElementById('len-picker').style.display='block';document.getElementById('mode-picker').style.display='block';document.getElementById('fmt-picker').style.display='block';document.getElementById('world-info').style.display='block';document.getElementById('player-list').innerHTML='<li>Giocatore</li>'.repeat(5)}''')
      if name=='results':
        page.evaluate('''()=>{document.getElementById('results-list').innerHTML='<li>Giocatore: 1:34</li>'.repeat(5);let c=document.getElementById('results-trace');c.style.display='block'}''')
      sizes=page.evaluate('''()=>{const elm=document.querySelector('.page');return {sh:document.scrollingElement.scrollHeight,ch:document.scrollingElement.clientHeight,bodyOverflow:getComputedStyle(document.body).overflowY,visible:document.querySelector('.screen--active .card').getBoundingClientRect().height}}''')
      if sizes['sh']>sizes['ch']+8:
        page.evaluate('window.scrollTo(0,document.scrollingElement.scrollHeight)')
        bottom=page.evaluate('Math.round(window.scrollY)')
        if bottom<=0:fails.append((width,height,name,sizes,'cannot scroll'))
      print(width,height,name,sizes)
      if width==390 and name in ['lobby','results']:
        page.screenshot(path=str(root/f'test-{name}-390.png'),full_page=True)
    page.close()
  qa=browser.new_page(viewport={'width':390,'height':667})
  html=(root/'test-fisica.html').read_text()
  html=re.sub(r'<script[^>]*src="[^"]*"[^>]*></script>', '',html)
  qa.set_content(html,wait_until='domcontentloaded')
  qa.evaluate('window.scrollTo(0,document.scrollingElement.scrollHeight)')
  print('QA scroll',qa.evaluate('({y:window.scrollY,h:document.scrollingElement.scrollHeight,ch:document.scrollingElement.clientHeight})'))
  qa.close()
  browser.close()
  print('FAILS',fails)
  if fails:raise SystemExit(1)
