import json
from playwright.sync_api import sync_playwright
OUT = '/home/ubuntu/bachess/tools/shots'
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width':1280,'height':720})
    pg.on('console', lambda m: errs.append(('console', m.type, m.text)) if m.type in ('error','warning') else None)
    pg.on('pageerror', lambda e: errs.append(('pageerror', str(e))))
    pg.goto('http://localhost:3000/'); pg.wait_for_timeout(400)
    pg.click('#btnPlay'); pg.wait_for_timeout(300)
    pg.evaluate("(()=>{const G=__bachess.S.G;G.gold=300;G.level=6;G.inv.push('mag','barrel','vest','plate','cell');__bachess.S.rollShop();__bachess.U.renderAll();})()")
    for i in range(1,6): pg.keyboard.press(str(i))
    pg.keyboard.press('a'); pg.wait_for_timeout(200)
    pos = pg.evaluate("(()=>{const r=__bachess.renderer;const u=r.units.find(x=>x.team===0);const bb=document.querySelector('#board').getBoundingClientRect();return {x:bb.left+u.x*bb.width/792,y:bb.top+(u.y)*bb.height/456}})()")
    for k in range(3):
        inv = pg.locator('#invGrid .islot.has').first.bounding_box()
        pg.mouse.move(inv['x']+15, inv['y']+15); pg.mouse.down(); pg.mouse.move(pos['x'], pos['y'], steps=6); pg.mouse.up(); pg.wait_for_timeout(100)
    pg.mouse.click(pos['x'], pos['y']); pg.wait_for_timeout(200)
    pg.mouse.move(640, 500); pg.wait_for_timeout(100)
    pg.screenshot(path=f'{OUT}/40_unitpanel.png')
    # 판매 드래그 테스트
    n0 = pg.evaluate("__bachess.S.G.board.filter(Boolean).length")
    pg.mouse.move(pos['x'], pos['y']); pg.mouse.down(); pg.mouse.move(500, 650, steps=8)
    pg.screenshot(path=f'{OUT}/41_dragsell.png')
    pg.mouse.up(); pg.wait_for_timeout(200)
    n1 = pg.evaluate("__bachess.S.G.board.filter(Boolean).length")
    print('sell drag', n0, n1)
    # 게임 오버 테스트
    pg.evaluate("(()=>{const G=__bachess.S.G;G.hp=1;G.round=12;__bachess.U.renderAll();})()")
    pg.keyboard.press('Space')
    for _ in range(100):
        if pg.locator('#btnOk').is_visible(): break
        pg.wait_for_timeout(500)
    pg.screenshot(path=f'{OUT}/42_result_lose.png')
    pg.click('#btnOk'); pg.wait_for_timeout(600)
    pg.screenshot(path=f'{OUT}/43_gameover.png')
    pg.click('#btnToTitle'); pg.wait_for_timeout(400)
    pg.screenshot(path=f'{OUT}/44_title_best.png')
    print('errors', json.dumps(errs, ensure_ascii=False)[:1500])
    b.close()
