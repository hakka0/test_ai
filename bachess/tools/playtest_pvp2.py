# 끝까지 진행(빠르게): 준비 시간 단축 + 3배속, 탈락/종료 화면까지
import time, json
from playwright.sync_api import sync_playwright
OUT='/home/ubuntu/bachess/tools/shots'
errs=[]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width':1280,'height':720})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto('http://localhost:3000/'); pg.wait_for_timeout(500)
    pg.click('#btnPlay'); pg.wait_for_timeout(300)
    pg.evaluate("window.__bachess.U.UI.speed=3; window.__bachess.renderer.speed=3")
    t0=time.time(); rounds=0; last=''; ghost=False; shotL=False
    while time.time()-t0<240:
        st=pg.evaluate("(()=>{const G=window.__bachess.S.G;return [G.phase,G.round,G.hp,G.oppGhost,!document.querySelector('#endScreen').classList.contains('hidden')]})()")
        ph=st[0]
        if st[3]: ghost=True
        if ph=='prep' and st[1]!=rounds:
            rounds=st[1]
            pg.keyboard.press('1'); pg.keyboard.press('2'); pg.keyboard.press('3'); pg.keyboard.press('f'); pg.keyboard.press('a')
            pg.evaluate("window.__bachess.S.G.prepT=Math.min(window.__bachess.S.G.prepT,1.5)")
        if ph in ('result','over') and pg.evaluate("!document.querySelector('#resultPanel').classList.contains('hidden')"):
            if rounds in (4,) and not shotL: pg.screenshot(path=OUT+'/q_result_r4.png'); shotL=True
            pg.keyboard.press('Space')
        if st[4]: break
        pg.wait_for_timeout(250)
    print('round',rounds,'ghost seen',ghost,'phase',pg.evaluate("window.__bachess.S.G.phase"))
    pg.wait_for_timeout(800)
    pg.screenshot(path=OUT+'/q_end.png')
    print('errors',errs)
    b.close()
