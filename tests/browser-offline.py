import os, shutil
"""Browser acceptance against the release HTML, without navigating to any URL.
Useful in managed environments that block all browser navigation. This is not a
substitute for the hosted HTTP share flow in browser.py; API tests cover that server.
"""
import json, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-output'; OUT.mkdir(exist_ok=True)
checks=[]
def passed(name):
    checks.append(name); print('PASS', name, flush=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'), headless=True, args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1512,'height':1120}, device_scale_factor=1)
    errors=[]; requests=[]
    page.on('pageerror', lambda e: errors.append(str(e.stack)))
    page.on('request', lambda r: requests.append(r.url) if not r.url.startswith('blob:') else None)
    page.set_content((ROOT/'release/Optimizer-Playground.html').read_text(), wait_until='load')
    assert page.locator('#terrainSelect').input_value()=='ravine'
    assert page.locator('#codeEditor').input_value().startswith('//')
    passed('portable HTML loads a usable code editor and preset terrain')
    assert not requests and not errors
    passed('no external assets, automatic upload or background simulation on load')
    # First-run flow should work without editing source code or switching to another screen.
    assert page.locator('#quickStartButton').is_visible()
    assert page.locator('#quickCompareButton').is_hidden()
    page.locator('#quickStartButton').click()
    page.wait_for_function('() => Number(document.body.dataset.resultsCount) === 3', timeout=15000)
    assert page.locator('#quickCompareButton').is_visible()
    assert '観測' in page.locator('#quickResult').text_content()
    original_code = page.locator('#codeEditor').input_value()
    page.locator('#quickCompareButton').click()
    page.wait_for_function('() => document.querySelector("#quickResult").textContent.includes("β=0.20")', timeout=15000)
    assert page.locator('#betaRange').input_value() == '0.2'
    assert page.locator('#codeEditor').input_value() == original_code
    assert 'β=0.90' in page.locator('#quickResult').text_content()
    assert page.locator('#quickStartButton').is_enabled()
    assert page.locator('#previousPathControl').is_visible()
    assert 'β=0.90' in page.locator('#previousPathLabel').text_content()
    page.locator('#timeline').fill('60'); page.locator('#timeline').dispatch_event('input')
    page.wait_for_timeout(150)
    with_ghost = [page.locator('#terrainCanvas').evaluate('(el) => el.toDataURL()'), page.locator('#lossCanvas').evaluate('(el) => el.toDataURL()')]
    page.locator('#showPreviousPath').uncheck()
    page.wait_for_timeout(150)
    without_ghost = [page.locator('#terrainCanvas').evaluate('(el) => el.toDataURL()'), page.locator('#lossCanvas').evaluate('(el) => el.toDataURL()')]
    assert all(a != b for a,b in zip(with_ghost, without_ghost)), 'The previous trajectory should affect both charts'
    page.locator('#showPreviousPath').check()
    page.screenshot(path=str(OUT/'quick-compare.png'), full_page=True)
    page.locator('#shareButton').click()
    assert '前回の比較軌跡は投稿に含まれません' in page.locator('#sharePreview').text_content()
    page.locator('#closeShare').click()
    passed('first-run flow computes beta-only comparison and overlays both previous charts without replacing code')
    page.locator('#runButton').click()
    page.wait_for_function('() => Number(document.body.dataset.resultsCount) === 3', timeout=15000)
    assert page.locator('#currentLoss').text_content()!='—'
    passed('three actual Worker simulations return numeric loss and trajectories')
    page.locator('#timeline').fill('70'); page.locator('#timeline').dispatch_event('input')
    assert page.locator('#stepNow').text_content()=='70'
    assert page.locator('#pauseButton').text_content()=='▶'
    passed('timeline scrubbing pauses replay and synchronizes inspector')
    page.locator('#stepButton').click()
    assert page.locator('#stepNow').text_content()=='71'
    page.locator('#runLegend button').nth(2).click()
    assert page.locator('#focusName').text_content()=='Adam'
    page.locator('#runLegend button').first.click()
    passed('one-step replay and changing inspected optimizer work')
    for selector in ['.field-label', '.tool span', '#codeEditor', '.check-row label', '.readout-list>div>span']:
        size = page.locator(selector).first.evaluate('(el) => parseFloat(getComputedStyle(el).fontSize)')
        assert size >= 12, f'Desktop essential text {selector} only {size}px'
    passed('essential desktop experiment controls remain legible at default zoom')
    page.screenshot(path=str(OUT/'desktop.png'), full_page=True)
    page.locator('[data-tab="visual"]').click()
    old=page.locator('#codeEditor').input_value()
    page.locator('#recipeTransform').select_option('sign'); page.locator('#applyRecipe').click()
    assert 'Math.sign' in page.locator('#codeEditor').input_value()
    assert page.locator('#resultsTable tbody tr').count()==0
    passed('visual recipe generates code and invalidates stale results')
    assert page.locator('#quickCompareButton').is_hidden()
    assert page.locator('#previousPathControl').is_hidden()
    passed('changing the optimizer code removes the stale guided comparison')
    page.screenshot(path=str(OUT/'visual-editor.png'), full_page=True)
    page.locator('#undoRecipe').click()
    assert page.locator('#codeEditor').input_value()==old
    assert page.locator('#optimizerSelect').input_value()=='momentum', 'Undo should restore the original method identity'
    passed('visual edits can be undone without losing previous code')
    # Manual edits following a generated recipe must not be discarded by stale Undo.
    page.locator('#applyRecipe').click()
    page.locator('[data-tab="code"]').click()
    original_manual = 'function step(a) { return { point: a.point }; }'
    page.locator('#codeEditor').fill(original_manual)
    page.locator('[data-tab="visual"]').click()
    assert page.locator('#undoRecipe').is_disabled(), 'Manual edits must invalidate stale recipe undo'
    assert page.locator('#codeEditor').input_value() == original_manual
    passed('manual code editing safely invalidates stale visual-recipe undo')
    page.locator('[data-tool="raise"]').click()
    canvas=page.locator('#terrainCanvas'); rect=canvas.bounding_box()
    canvas.click(position={'x':rect['width']/2,'y':rect['height']/2})
    assert page.locator('#brushCount').text_content()=='1'
    assert page.locator('#terrainTag').text_content()=='CUSTOM LANDSCAPE'
    page.locator('#runButton').click();page.wait_for_function('() => Number(document.body.dataset.resultsCount)>0')
    assert page.locator('#scoreValue').text_content()=='—'
    passed('hand-drawn landscape changes objective and disables unsupported optimality score')
    page.locator('#clearBrush').click()
    assert page.locator('#brushCount').text_content()=='0'
    assert page.locator('#terrainTag').text_content()!='CUSTOM LANDSCAPE'
    passed('brush reset restores the known preset')
    page.locator('.formula-details summary').click()
    page.locator('#expressionInput').fill('window.fetch(1)');page.locator('#applyExpression').click()
    assert page.locator('#notice').get_attribute('class').endswith('error')
    page.locator('#expressionInput').fill('(x^2+y^2)/4');page.locator('#applyExpression').click()
    assert page.locator('#terrainTag').text_content()=='CUSTOM LANDSCAPE'
    passed('formula editor rejects unsafe syntax and applies valid expressions')
    page.locator('#terrainSelect').select_option('bowl')
    page.locator('[data-tab="code"]').click()
    page.locator('#codeEditor').fill('function step(a){while(true){}}')
    page.locator('#runButton').click()
    page.wait_for_function('() => document.querySelector("#runReason").textContent.includes("命令予算")', timeout=15000)
    assert page.locator('#runButton').is_enabled()
    passed('infinite user loop hits operation budget and does not freeze the UI')
    page.locator('#codeEditor').fill('function step(a){return {point:[NaN,0]};}')
    page.locator('#runButton').click()
    page.wait_for_function('() => Number(document.body.dataset.resultsCount)>0',timeout=15000)
    assert page.locator('#runStatus').text_content()=='ERROR'
    passed('nonfinite output is displayed as an error rather than a success')
    page.locator('#optimizerSelect').select_option('sgd')
    assert page.locator('#focusName').text_content()=='SGD'
    passed('changing optimizers clears stale inspector labels')
    page.locator('#benchmarkButton').click()
    page.wait_for_function('() => document.querySelectorAll("#benchmarkRows tr").length===9', timeout=45000)
    for row in page.locator('#benchmarkRows tr').all():
        cells=row.locator('td').all_text_contents();assert cells[1]==cells[2],cells
    assert '平均' in page.locator('#benchmarkSummary').text_content()
    passed('fixed nine-case challenge reproduces the same SGD baseline')
    page.locator('#shareButton').click()
    assert page.locator('#publishButton').is_disabled()
    assert '投稿API' in page.locator('#shareMessage').text_content()
    assert '共通チャレンジの概要' in page.locator('#sharePreview').text_content()
    page.locator('#closeShare').click()
    passed('offline sharing is explicitly unavailable; challenge code/results are ready for hosted publication')
    page.locator('#guideButton').click();assert page.locator('#helpDialog').is_visible();page.locator('#closeHelp').click()
    passed('help dialog opens and closes')
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(200)
    assert page.locator('#guideButton').is_visible(), 'Mobile visitors must be able to open the guide'
    page.locator('#guideButton').click()
    assert page.locator('#helpDialog').is_visible()
    page.locator('#closeHelp').click()
    passed('mobile guide is accessible from the header')
    for selector in ['.field-label', '.tool span', '#codeEditor', '.check-row label', '.readout-list>div>span']:
        size = page.locator(selector).first.evaluate('(el) => parseFloat(getComputedStyle(el).fontSize)')
        assert size >= 12, f'{selector} only has {size}px mobile text'
    for selector in ['#guideButton', '#shareButton', '.tool', '#stepButton']:
        height = page.locator(selector).first.bounding_box()['height']
        assert height >= 40, f'{selector} only has {height}px mobile touch height'
    passed('important mobile controls have readable text and >=40px touch height')
    assert page.locator('#quickStartButton').is_visible()
    assert page.locator('#quickStartButton').bounding_box()['height'] >= 40
    passed('first-run action remains visible and touch-sized on phones')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
    page.screenshot(path=str(OUT/'mobile.png'),full_page=True)
    passed('390px layout has no horizontal page overflow')
    # The code editor must preserve line numbering for long lines, even on small screens.
    page.locator('#codeEditor').fill('const veryLongLine = ' + '1234567890' * 25 + ';')
    dimensions = page.locator('#codeEditor').evaluate('(el) => ({width:el.clientWidth,scroll:el.scrollWidth})')
    assert dimensions['scroll'] > dimensions['width'], f'Long code line wrapped rather than scrolling: {dimensions}'
    passed('long source lines scroll horizontally rather than desynchronizing line numbers')
    for width in [320, 768]:
        page.set_viewport_size({'width':width, 'height':844})
        assert page.locator('#guideButton').is_visible(), f'Guide hidden at {width}px'
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), f'Overflow at {width}px'
    passed('guide and page layout also remain usable at 320px and 768px widths')
    assert not errors,errors
    assert not requests,requests
    passed('all interactions produce no uncaught browser errors or network requests')
    version=browser.version;browser.close()
(OUT/'browser-offline-results.json').write_text(json.dumps({'browser':version,'mode':'in-memory portable HTML; no HTTP navigation','passed':checks,'count':len(checks)},ensure_ascii=False,indent=2))
