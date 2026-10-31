"""Browser acceptance for interactive optimizer trace inspection."""
import os
import csv
import io
import pathlib
import shutil
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-output'
OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'), headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1220, 'height': 1000})
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content((ROOT / 'release/Optimizer-Playground.html').read_text(), wait_until='load')
    assert page.locator('[data-tool="inspect"]').count() == 1, 'Expected an explicit trace inspection mode'
    page.locator('#terrainSelect').select_option('bowl')
    page.locator('#optimizerSelect').select_option('sgd')
    for cb in page.locator('input[name="reference"]').all():
        if cb.is_checked(): cb.uncheck()
    page.locator('#startX').fill('2');page.locator('#startX').dispatch_event('change')
    page.locator('#startY').fill('1');page.locator('#startY').dispatch_event('change')
    page.locator('#learningRate').fill('0.3');page.locator('#learningRate').dispatch_event('change')
    page.locator('#maxSteps').fill('20');page.locator('#maxSteps').dispatch_event('change')
    page.locator('#quickStartButton').click()
    page.wait_for_function('() => Number(document.body.dataset.resultsCount) === 1',timeout=15000)
    assert page.locator('#runLegend button').count() == 1
    page.locator('[data-tab="results"]').click()
    with page.expect_download() as info:
        page.locator('#downloadCSV').click()
    csv_text = pathlib.Path(info.value.path()).read_text(encoding='utf-8-sig')
    page.locator('[data-tab="code"]').click()
    csv_rows = list(csv.reader(io.StringIO(csv_text)))
    assert csv_rows[0][6:10] == ['departure_gradient_x','departure_gradient_y','point_gradient_x','point_gradient_y'], 'CSV should distinguish departure from displayed-point gradients'
    row = next(row for row in csv_rows[1:] if row[0] == 'SGD' and row[1] == '1')
    assert abs(float(row[6]) - 2) < 1e-8, 'step 1 source gradient is at start x=2'
    assert abs(float(row[8]) - 1.4) < 1e-8, 'step 1 displayed gradient is at x=1.4'
    page.locator('#timeline').fill('12');page.locator('#timeline').dispatch_event('input')
    assert page.locator('#stepNow').text_content() == '12'
    page.locator('[data-tool="inspect"]').click()
    assert '軌跡' in page.locator('#mapTip').text_content()
    # Aim exactly for SGD update #3 at p=[2*0.7^3,0.7^3] on bowl [-3,3].
    canvas=page.locator('#terrainCanvas')
    bounds=canvas.bounding_box()
    w,h=bounds['width'],bounds['height']
    s=max(80,min(w-72,h-44)); x=(w-s)/2; y=10
    px=x+(2*0.7**3+3)/6*s
    py=y+(3-0.7**3)/6*s
    canvas.click(position={'x':px,'y':py})
    selected=int(page.locator('#stepNow').text_content())
    assert selected==3, f'Map inspector chose step {selected}, expected 3'
    assert float(page.locator('#startX').input_value())==2, 'Inspect mode must not modify the initial point'
    assert '勾配' in page.locator('#stepVectorReadout').text_content()
    assert page.locator('#gradientNorm').text_content()!='—'
    # Time-series click must jump to a different step and update the inspector.
    signal=page.locator('#signalCanvas')
    signal.click(position={'x':signal.bounding_box()['width']*0.7,'y':55})
    picked=int(page.locator('#stepNow').text_content())
    assert picked>selected, 'Signal chart did not synchronize the timeline'
    assert page.locator('#timeline').input_value()==str(picked)
    assert page.locator('#positionX').text_content()!='—'
    signal.focus(); signal.press('ArrowLeft')
    assert int(page.locator('#stepNow').text_content())==picked-1, 'Signal chart keyboard navigation should follow the same timeline'
    # Capture the synchronized views before showing a miss-click toast.
    page.screenshot(path=str(OUT/'linked-inspection-desktop.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    page.wait_for_timeout(100)
    assert page.locator('[data-tool="inspect"]').is_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
    page.screenshot(path=str(OUT/'linked-inspection-mobile.png'),full_page=True)
    page.set_viewport_size({'width':1220,'height':1000})
    # A click far from recorded traces must not edit terrain or scrub timeline.
    canvas=page.locator('#terrainCanvas'); bounds=canvas.bounding_box();w,h=bounds['width'],bounds['height'];s=max(80,min(w-72,h-44));x=(w-s)/2;y=10
    canvas.click(position={'x':x+12,'y':y+12})
    assert int(page.locator('#stepNow').text_content())==picked-1
    assert float(page.locator('#startX').input_value())==2
    # Editing via the original start-point mode still works.
    page.set_viewport_size({'width':1220,'height':1000})
    page.locator('[data-tool="start"]').click()
    canvas=page.locator('#terrainCanvas'); bounds=canvas.bounding_box();w,h=bounds['width'],bounds['height'];s=max(80,min(w-72,h-44));x=(w-s)/2;y=10
    canvas.click(position={'x':x+s/2,'y':y+s/2})
    assert float(page.locator('#startX').input_value())==0
    assert page.locator('#stepNow').text_content()=='0'
    assert not errors, errors
    browser.close()
    print('PASS linked spatial/temporal inspection, scientific readouts and mobile UI')
