from playwright.sync_api import sync_playwright
OUT = '/home/ubuntu/bachess/tools/shots'
errs=[]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width':1280,'height':720})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:3000/'); pg.wait_for_timeout(400)
    pg.click('#btnPlay'); pg.wait_for_timeout(300)
    pg.evaluate("(()=>{const G=__bachess.S.G;G.gold=500;G.level=8;G.round=9;__bachess.S.rollShop();__bachess.U.renderAll();})()")
    for k in range(4):
        for i in range(1,6): pg.keyboard.press(str(i))
        pg.keyboard.press('d')
    pg.keyboard.press('a'); pg.wait_for_timeout(300)
    pg.keyboard.press('Space')
    for i,t in enumerate([1500,1200,1200,1500,1500]):
        pg.wait_for_timeout(t)
        pg.screenshot(path=f'{OUT}/50_fx{i}.png')
    print(errs)
    b.close()
