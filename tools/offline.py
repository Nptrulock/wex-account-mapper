import sys
from playwright.sync_api import sync_playwright
URL = sys.argv[1]
with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True)
    ctx = br.new_context(); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_function('() => window.__ready === true')
    pg.wait_for_function('() => navigator.serviceWorker && navigator.serviceWorker.controller !== null || (location.reload(), false)', timeout=15000) if False else None
    pg.evaluate('() => navigator.serviceWorker.ready.then(() => true)'); pg.wait_for_timeout(1500)
    pg.evaluate('() => loadSample()'); pg.wait_for_timeout(500)
    ctx.set_offline(True)
    pg.reload(); pg.wait_for_function('() => window.__ready === true', timeout=15000)
    n = pg.locator('#tree .node').count()
    man = pg.evaluate('() => !!document.querySelector("link[rel=manifest]")')
    print(('PASS' if n == 5 else 'FAIL') + ' offline reload works, data still there (nodes=%d)' % n)
    print(('PASS' if man else 'FAIL') + ' manifest linked'); print(('PASS' if not errs else 'FAIL') + ' no page errors', errs)
    br.close()
