from playwright.sync_api import sync_playwright
from pathlib import Path
import re
root=Path('/mnt/data/dw_v25_qa')
html=re.sub(r'<script src="tests/browser-matter-qa.js[^>]*></script>', '', (root/'test-fisica.html').read_text())
script=(root/'tests/browser-matter-qa.js').read_text()
with sync_playwright() as pw:
 b=pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
 p=b.new_page()
 p.route('**/*',lambda route: route.abort())
 errors=[];p.on('pageerror', lambda e:errors.append(str(e)))
 p.set_content(html,wait_until='domcontentloaded')
 p.add_script_tag(content=script)
 p.locator('#start').click()
 p.wait_for_function("document.querySelector('#engine').textContent.includes('Impossibile')",timeout=15000)
 print('Expected CDN failure detected:',p.locator('#engine').inner_text())
 print('Report explains failure:', bool(p.evaluate("document.querySelector('#report').textContent.includes('loadFailure')")))
 print('Page JS exceptions:',errors)
 b.close()
 if errors: raise Exception(errors)
