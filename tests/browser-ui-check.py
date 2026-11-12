from playwright.sync_api import sync_playwright
from pathlib import Path
import re
root=Path('/mnt/data/dw_v25_qa')
html=re.sub(r'<script src="tests/browser-matter-qa.js[^>]*></script>', '', (root/'test-fisica.html').read_text())
script=(root/'tests/browser-matter-qa.js').read_text()
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':980,'height':820},device_scale_factor=1)
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html,wait_until='domcontentloaded',timeout=15000)
 page.add_script_tag(content=script)
 page.wait_for_timeout(200)
 print('Title:',page.title())
 print('Start:',page.locator('#start').inner_text())
 print('Initial status:',page.locator('#status').inner_text())
 print('Exceptions:',errors)
 page.screenshot(path='/mnt/data/Doodle-Wheels-V25.1-Test-Fisica-Preview.png',full_page=True)
 browser.close()
 if errors: raise Exception(errors)
