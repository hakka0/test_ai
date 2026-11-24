import json, os
from playwright.sync_api import sync_playwright
OUT = '/home/ubuntu/bachess/tools/shots'
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width':1280,'height':720})
    pg.on('console', lambda m: errs.append(('console', m.type, m.text)) if m.type in ('error','warning') else None)
    pg.on('pageerror', lambda e: errs.append(('pageerror', str(e))))
    pg.goto('http://localhost:3000/')
    pg.wait_for_timeout(500)
    pg.click('#btnPlay')
    pg.wait_for_timeout(300)
    # 골드 보너스 + 레벨업
    pg.evaluate("(()=>{const G=__bachess.S.G;G.gold=300;G.level=7;G.inv.push('mag','barrel','vest','plate','cell','mag');__bachess.S.rollShop();__bachess.U.renderAll();})()")
    pg.wait_for_timeout(300)
    pg.screenshot(path=f'{OUT}/10_shop.png')
    # 구매 5개 & 리롤 후 구매
    for i in range(1,6): pg.keyboard.press(str(i))
    pg.keyboard.press('d')
    for i in range(1,6): pg.keyboard.press(str(i))
    pg.keyboard.press('a')
    pg.wait_for_timeout(300)
    # 드래그 테스트: 아이템을 보드 유닛에게
    inv = pg.locator('#invGrid .islot.has').first.bounding_box()
    # find a board unit position from renderer
    pos = pg.evaluate("(()=>{const r=__bachess.renderer;const u=r.units.find(x=>x.team===0);const bb=document.querySelector('#board').getBoundingClientRect();return {x:bb.left+u.x*bb.width/792,y:bb.top+(u.y)*bb.height/456, uid:u.uid}})()")
    pg.mouse.move(inv['x']+20, inv['y']+20); pg.mouse.down(); pg.mouse.move(pos['x'], pos['y'], steps=8); pg.mouse.up()
    pg.wait_for_timeout(200)
    # 클릭 선택
    pg.mouse.click(pos['x'], pos['y'])
    pg.wait_for_timeout(200)
    pg.mouse.move(pos['x']+1, pos['y']+1)
    pg.wait_for_timeout(200)
    pg.screenshot(path=f'{OUT}/11_selected.png')
    print(pg.evaluate("(()=>{const G=__bachess.S.G;return {bench:G.bench.filter(Boolean).length,board:G.board.filter(Boolean).length,gold:G.gold,inv:G.inv.length}})()"))
    # 시너지 호버
    pg.hover('#synList li >> nth=0'); pg.wait_for_timeout(200)
    pg.screenshot(path=f'{OUT}/12_syn.png')
    pg.keyboard.press('s'); pg.wait_for_timeout(300)
    pg.screenshot(path=f'{OUT}/13_syn_collapsed.png')
    pg.keyboard.press('s')
    pg.mouse.move(640, 300)
    # 전투 진행 (여러 라운드)
    for rd in range(1, 8):
        pg.keyboard.press('Space')
        pg.wait_for_timeout(2500)
        if rd in (1, 4, 5): pg.screenshot(path=f'{OUT}/20_battle_r{rd}.png')
        # 2배속 3배속 시험
        if rd == 2: pg.keyboard.press('q'); pg.keyboard.press('q')
        for _ in range(80):
            if pg.locator('#btnOk').is_visible(): break
            pg.wait_for_timeout(500)
        pg.wait_for_timeout(200)
        if rd in (1, 5): pg.screenshot(path=f'{OUT}/21_result_r{rd}.png')
        if pg.locator('#btnOk').is_visible(): pg.click('#btnOk')
        pg.wait_for_timeout(500)
        if pg.locator('#endScreen:not(.hidden)').count(): break
        st = pg.evaluate("(()=>{const G=__bachess.S.G;return [G.round,G.hp,G.gold,G.phase]})()")
        print(rd, st)
        pg.evaluate("(()=>{const G=__bachess.S.G;G.gold=Math.max(G.gold,60);__bachess.U.renderAll();})()")
        for i in range(1,6): pg.keyboard.press(str(i))
        pg.keyboard.press('a')
    pg.screenshot(path=f'{OUT}/30_after.png')
    print('errors', json.dumps(errs, ensure_ascii=False)[:2000])
    b.close()
