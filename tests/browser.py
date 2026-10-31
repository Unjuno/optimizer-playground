"""End-to-end acceptance tests against the actual Chromium browser (no external requests)."""
import os, json, pathlib, tempfile, subprocess, time, socket, shutil
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'test-output';OUT.mkdir(exist_ok=True)
with socket.socket() as sock:sock.bind(('127.0.0.1',0));PORT=sock.getsockname()[1]
data=tempfile.mkdtemp(prefix='optimizer-e2e-')
server=subprocess.Popen(['node','server/index.mjs'],cwd=ROOT,env={**os.environ,'PORT':str(PORT),'DATA_DIR':data},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
base=f'http://127.0.0.1:{PORT}'
checks=[]
def check(name,fn):
    fn();checks.append(name);print('PASS',name,flush=True)
try:
    import urllib.request
    for attempt in range(50):
        try:
            urllib.request.urlopen(base + '/api/status', timeout=1).close()
            break
        except OSError:
            time.sleep(.1)
    else:
        raise RuntimeError('Test server did not start')
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1512,'height':1120},device_scale_factor=1)
        errors=[];posts=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('request',lambda r:posts.append(r.url) if r.method=='POST' else None)
        page.goto(base,wait_until='networkidle')
        check('page loads usable editor',lambda:page.locator('#runButton').wait_for())
        assert not posts,'No automatic posts allowed'
        page.locator('#runButton').click();page.wait_for_function('() => document.body.dataset.resultsCount >= 1')
        check('real simulation returns loss values',lambda:page.locator('#resultsTable tbody tr').first.wait_for(state='attached'))
        page.locator('#pauseButton').click()
        page.locator('#timeline').fill('30');page.locator('#timeline').dispatch_event('input')
        check('spatial and temporal scrub synchronized',lambda:page.wait_for_function('() => document.querySelector("#stepNow").textContent === "30"'))
        page.screenshot(path=str(OUT/'desktop.png'),full_page=True)
        page.locator('[data-tab="visual"]').click();page.locator('#recipeTransform').select_option('sign');page.locator('#applyRecipe').click()
        check('visual editor writes executable code',lambda:page.wait_for_function('() => document.querySelector("#codeEditor").value.includes("Math.sign")'))
        page.locator('[data-tool="raise"]').click();page.locator('#terrainCanvas').click(position={'x':230,'y':180})
        check('drawing changes actual objective',lambda:page.wait_for_function('() => document.querySelector("#brushCount").textContent !== "0"'))
        page.locator('#clearBrush').click();page.locator('#terrainSelect').select_option('bowl')
        page.locator('[data-tab="code"]').click();page.locator('#optimizerSelect').select_option('adam')
        page.locator('#runButton').click();page.wait_for_function('() => document.body.dataset.resultsCount >= 1')
        page.locator('#shareButton').click();page.locator('#publishConsent').check();page.locator('#publishButton').click()
        page.wait_for_function('() => document.querySelector("#shareURL").value.includes("?s=")')
        url=page.locator('#shareURL').input_value();key=page.locator('#createdDeleteKey').input_value()
        assert len(key)>40
        shared=browser.new_page(viewport={'width':1280,'height':900});shared.goto(url,wait_until='networkidle')
        check('shared URL loads without auto-execution',lambda:shared.wait_for_function('() => document.body.dataset.shared === "true" && document.body.dataset.phase !== "computing"'))
        shared.locator('#manageButton').click();shared.locator('#deleteKeyInput').fill('wrong');shared.locator('#confirmDelete').click();shared.wait_for_function('() => document.querySelector("#deleteMessage").textContent.includes("一致")')
        shared.locator('#deleteKeyInput').fill(key);shared.locator('#confirmDelete').click()
        check('deletion key removes post',lambda:shared.wait_for_function('() => document.querySelector("#deleteMessage").textContent.includes("削除しました")'))
        page.locator('#closeShare').click()
        page.locator('#codeEditor').fill('function step(a){while(true){}}');page.locator('#runButton').click()
        check('infinite loop terminates and UI survives',lambda:page.wait_for_function('() => document.querySelector("#runReason").textContent.includes("予算")',timeout=15000))
        page.locator('#optimizerSelect').select_option('sgd');page.locator('#benchmarkButton').click()
        check('fixed multi-task challenge produces nine rows',lambda:page.wait_for_function('() => document.querySelectorAll("#benchmarkRows tr").length === 9',timeout=45000))
        page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(OUT/'mobile.png'),full_page=True)
        check('mobile has no horizontal page overflow',lambda:page.wait_for_function('() => document.documentElement.scrollWidth <= innerWidth + 1'))
        assert not errors,errors
        checks.append('no uncaught browser errors')
        portable=browser.new_page();portable.goto((ROOT/'release'/'Optimizer-Playground.html').as_uri(),wait_until='load');portable.locator('#runButton').click()
        check('portable offline HTML computes in a worker',lambda:portable.wait_for_function('() => document.body.dataset.resultsCount >= 1',timeout=15000))
        browser.close()
    (OUT/'browser-results.json').write_text(json.dumps({'passed':checks,'count':len(checks)},ensure_ascii=False,indent=2))
finally:
    server.terminate();server.wait(timeout=5);shutil.rmtree(data,ignore_errors=True)
