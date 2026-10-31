"""Regression coverage for error outcomes after quick comparison, portable release."""
import os
import pathlib
import shutil
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1150,'height':880})
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.set_content((ROOT/'release/Optimizer-Playground.html').read_text(),wait_until='load')
    page.locator('#terrainSelect').select_option('bowl')
    page.locator('#learningRate').fill('3')
    page.locator('#learningRate').dispatch_event('change')
    page.locator('#quickStartButton').click()
    page.wait_for_function('() => Number(document.body.dataset.resultsCount) === 3', timeout=15000)
    assert '観測' in page.locator('#quickResult').text_content()
    assert page.locator('#quickCompareButton').is_visible()
    page.locator('#quickCompareButton').click()
    page.wait_for_function('() => Number(document.body.dataset.resultsCount) === 3', timeout=15000)
    assert '範囲外' in page.locator('#quickResult').text_content()
    assert page.locator('#runStatus').text_content() == 'ERROR', 'Out-of-bounds stop should be reported as ERROR'
    assert page.locator('#previousPathControl').is_visible(), 'Users must be able to inspect the previous successful path even after a failed beta trial'
    assert int(page.locator('#timeline').get_attribute('max')) >= 69, 'Timeline should be able to scrub the previously successful path'
    page.locator('#timeline').fill('30');page.locator('#timeline').dispatch_event('input');page.wait_for_timeout(100)
    with_prev=page.locator('#terrainCanvas').evaluate('(el) => el.toDataURL()')
    page.locator('#showPreviousPath').uncheck();page.wait_for_timeout(100)
    without_prev=page.locator('#terrainCanvas').evaluate('(el) => el.toDataURL()')
    assert with_prev != without_prev, 'The previous successful path must still be visible on the terrain when the new run fails'
    page.locator('#showPreviousPath').check()
    page.screenshot(path=str(ROOT/'docs/screenshots/failed-beta-comparison.png'), full_page=True)
    page.set_viewport_size({'width':390, 'height':844})
    page.wait_for_timeout(100)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Failed trial message overflows narrow mobile screens'
    page.screenshot(path=str(ROOT/'docs/screenshots/failed-beta-comparison-mobile.png'), full_page=True)
    assert not errors, errors
    print('PASS failed beta trial retains comparable historical trace and clear failure reason')
    browser.close()
