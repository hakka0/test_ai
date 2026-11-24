import sys, json, time
from playwright.sync_api import sync_playwright
OUT = '/home/ubuntu/bachess/tools/shots'
import os; os.makedirs(OUT, exist_ok=True)
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width':1280,'height':720})
    pg.on('console', lambda m: errs.append(('console', m.type, m.text)) if m.type in ('error','warning') else None)
    pg.on('pageerror', lambda e: errs.append(('pageerror', str(e))))
    pg.goto('http://localhost:3000/')
    pg.wait_for_timeout(600)
    pg.click('#btnPlay')
    pg.wait_for_timeout(500)
    pg.screenshot(path=f'{OUT}/1_prep.png')
    # 구매: 몇 개
    for i in range(1, 4):
        pg.keyboard.press(str(i))
    pg.wait_for_timeout(200)
    # 벤치 → 보드 배치 (자동 배치)
    pg.keyboard.press('a')
    pg.wait_for_timeout(300)
    pg.screenshot(path=f'{OUT}/2_bought.png')
    st = pg.evaluate("(()=>{const G=window.__bachess.S.G;return {bench:G.bench.filter(Boolean).length,board:G.board.filter(Boolean).length,gold:G.gold}})()")
    print('state', st)
    # 호버 툴팁
    pg.hover('#shopRow .scard >> nth=0')
    pg.wait_for_timeout(200)
    pg.screenshot(path=f'{OUT}/3_tip.png')
    pg.keyboard.press('r'); pg.wait_for_timeout(300)
    pg.hover('.rtable td >> nth=4'); pg.wait_for_timeout(200)
    pg.screenshot(path=f'{OUT}/4_recipe.png')
    pg.keyboard.press('Escape')
    pg.keyboard.press('Space')
    pg.wait_for_timeout(3500)
    pg.screenshot(path=f'{OUT}/5_battle.png')
    pg.wait_for_timeout(1500)
    pg.screenshot(path=f'{OUT}/6_battle2.png')
    print('errors', json.dumps(errs, ensure_ascii=False)[:2000])
    b.close()
