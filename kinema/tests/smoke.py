"""Offline Chromium/Playwright smoke tests for KINEMA 2.0.

Install: pip install playwright
Run: python tests/smoke.py

Chromium binary may be provided by Playwright (`playwright install chromium`)
or via env `CHROMIUM_BIN=/usr/bin/chromium`.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import math
import os

root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text(encoding='utf-8')
html=html.replace('<link rel="stylesheet" href="styles.css">','<style>'+ (root/'styles.css').read_text(encoding='utf-8') +'</style>')
html=html.replace('<script src="app.js"></script>','<script>'+ (root/'app.js').read_text(encoding='utf-8') +'</script>')

with sync_playwright() as pw:
    kwargs={'headless':True,'args':['--no-sandbox']}
    if os.environ.get('CHROMIUM_BIN'): kwargs['executable_path']=os.environ['CHROMIUM_BIN']
    browser=pw.chromium.launch(**kwargs)
    for viewport in [{'width':1440,'height':900},{'width':390,'height':844}]:
        page=browser.new_page(viewport=viewport)
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        # Provide storage for the about:blank document used by set_content.
        page.evaluate("""() => {const memory=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k),clear:()=>memory.clear()}})}""")
        page.set_content(html,wait_until='load')
        assert page.evaluate('document.documentElement.scrollWidth-innerWidth')==0
        assert page.locator('.mechanism-tab').count()==6
        assert page.locator('.joint-btn').count()==8
        for mechanism in ['slider','fourbar','gears','cam','yoke','robot']:
            page.locator(f'[data-mech="{mechanism}"]').click()
            for mode in ['q','v','a']:
                page.locator(f'[data-plot="{mode}"]').click()
                assert page.evaluate('''() => [0,.1,1,3,6.28].every(t=>Number.isFinite(motionValue(simulator.mech,t,simulator.plotMode)))''')
        page.locator('[data-mech="gears"]').click()
        page.evaluate('simulator.theta=2*Math.PI+.2')
        assert page.evaluate('simulator.theta>2*Math.PI')
        page.locator('[data-mech="robot"]').click()
        page.locator('#ikX').fill('140')
        page.locator('#ikY').fill('112')
        page.locator('#ikSolve').click()
        assert 'ПОГРЕШНОСТЬ' in page.locator('#ikResult').inner_text()
        assert page.evaluate('''() => {const r=robot(simulator.theta,rad(simulator.robotSecond));return Math.hypot((r.E.x-r.A.x)-140,(r.E.y-r.A.y)-112)}''')<1e-7
        page.locator('#ikX').fill('999')
        page.locator('#ikSolve').click()
        assert 'НЕДОСТИЖИМА' in page.locator('#ikResult').inner_text()
        residual=page.evaluate('''() => {let v=0;for(let i=0;i<=360;i++){const t=i*Math.PI/180;const p=slider(t,90,198);v=Math.max(v,Math.abs(Math.hypot(p.B.x-p.S.x,p.B.y-p.S.y)-198));const f=fourbar(t);v=Math.max(v,Math.abs(Math.hypot(f.B.x-f.C.x,f.B.y-f.C.y)-240),Math.abs(Math.hypot(f.C.x-f.D.x,f.C.y-f.D.y)-190));}return v}''')
        assert residual<1e-6
        page.locator('#exam').scroll_into_view_if_needed()
        for i in range(16):
            idx=page.evaluate(f'questions[{i}].correct')
            page.locator('#quizAnswers button').nth(idx).click()
            page.locator('#quizNext').click()
        assert '16' in page.locator('.quiz-end-score').inner_text()
        assert page.locator('[data-mark="mastery"]').is_disabled()
        assert page.evaluate('JSON.parse(localStorage.getItem("kinema_quiz_v1")).score')==16
        assert errors==[],errors
        print(f"OK {viewport['width']}x{viewport['height']}: 6 mechanisms, 3 graphs, IK, 16 questions, residual {residual:.3g} mm")
        page.close()
    browser.close()
print('KINEMA 2.0: smoke tests passed')
