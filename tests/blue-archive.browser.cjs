const { chromium, browserOptions } = require("./browser-runtime.cjs");
const { debugClick, selectDock } = require("./ui-helpers.cjs");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const url = "http://127.0.0.1:2644";
const screenshots = "test-results/blue-archive";
const processServer = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  env: { ...process.env, PORT: "2644", DEBUG_GAME: "1", NODE_ENV: "development" },
  stdio: "ignore",
});

async function main() {
  let browser;
  try {
    fs.mkdirSync(screenshots, { recursive: true });
    let healthy = false;
    for (let i = 0; i < 80 && !healthy; i++) {
      try { healthy = (await fetch(url + "/health")).ok; } catch { /* starting */ }
      if (!healthy) await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(healthy);
    browser = await chromium.launch(browserOptions());
    for (const mobile of [false, true]) {
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1400, height: 1000 },
        isMobile: mobile,
        hasTouch: mobile,
        ...(mobile ? { userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36" } : {}),
      });
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      const activate = locator => mobile ? locator.tap() : locator.click();
      const errors = [];
      const textures = new Set();
      page.on("pageerror", error => errors.push(error.message));
      page.on("response", response => {
        const path = new URL(response.url()).pathname;
        const loaded = response.ok() || response.status() === 304;
        if (/^\/units\/blue-archive\/\w+\.png$/.test(path) && loaded) textures.add(path);
        if (path.includes("/units/blue-archive/") && !loaded) errors.push(path + " HTTP " + response.status());
      });
      await page.goto(url);
      const portraits = await page.locator("#lobby .heroes img").evaluateAll(async images => {
        await Promise.all(images.map(image => image.decode()));
        return images.map(image => image.getAttribute("src"));
      });
      assert.equal(portraits.length, 3);
      assert.ok(portraits.every(path => path.startsWith("/units/blue-archive/icons/")));
      const sizes = mobile ? [[390,844], [320,740], [844,390], [740,360], [667,375], [480,320], [390,844]]
        : [[1400,1000], [1024,768]];
      const resize = async (width, height) => {
        await page.setViewportSize({ width, height });
        await page.waitForFunction(({ mobile, width, height }) =>
          document.documentElement.dataset.screenMode === (mobile ? "mobile" : "pc")
          && document.documentElement.dataset.screenOrientation === (width > height ? "landscape" : "portrait"),
        { mobile, width, height });
      };
      for (const [width, height] of sizes) {
        await resize(width, height);
        assert.deepEqual(await page.locator("#lobby .home-action").evaluateAll(buttons => buttons.map(button => button.id)),
          ["practice", "create", "pvp-practice"]);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        for (const id of ["practice", "create", "pvp-practice", "join"]) {
          const rect = await page.locator(`#${id}`).boundingBox();
          assert.ok(rect && rect.width >= 44 && rect.height >= 44, `${width}×${height} #${id}`);
        }
        await page.screenshot({ path: `${screenshots}/home-${width}-${height}.png`, fullPage: true, animations: "disabled" });
      }
      await resize(...sizes[0]);
      await activate(page.locator("#practice"));
      await page.waitForFunction(() => document.querySelector("#deployed").textContent === "0/1");
      await debugClick(page, "debug-pause");
      assert.match(await page.locator("#level-label").textContent(), /레벨 1 \/ 10/);
      assert.equal(await page.locator("#units [data-unit]").count(), 0);
      assert.equal(await page.locator("#shop-offers .shop-portrait img[src^='/units/blue-archive/']").count(), 5);
      assert.equal(await page.locator("#gold").textContent(), "10");

      const roomCode = await page.locator("#room-code").textContent();
      const enemy = page.locator("#player-ranking [data-self='false']");
      if (mobile) await activate(enemy);
      for (const [width, height] of sizes) {
        await resize(width, height);
        assert.equal(await page.locator("#room-code").textContent(), roomCode);
        if (mobile) assert.equal(await enemy.getAttribute("aria-pressed"), "true");
        const geometry = await page.evaluate(() => {
          const box = id => document.getElementById(id).getBoundingClientRect().toJSON();
          return { overflow: document.documentElement.scrollWidth > innerWidth, board: box("board-wrap"),
            bench: box("bench"), shop: box("pc-play-dock"), ranking: box("player-ranking") };
        });
        assert.equal(geometry.overflow, false, `${width}×${height}`);
        if (mobile && width > height) {
          assert.ok(geometry.board.right <= geometry.shop.left + 1 && geometry.shop.right <= geometry.ranking.left + 1);
          assert.ok(geometry.bench.bottom <= height + 1 && geometry.ranking.bottom <= height + 1);
        }
        await page.screenshot({ path: `${screenshots}/${width}-${height}.png`, animations: "disabled" });
      }
      if (mobile) {
        await resize(844, 390);
        const viewed = page.locator("#cells button[aria-label*='관전 칸,']:not([aria-label*='빈 칸'])").first();
        await activate(viewed);
        assert.equal(await page.locator("#unit-dialog").getAttribute("data-read-only"), "true");
        await activate(page.locator("#close-unit-dialog"));
        await activate(page.locator("#scout-return"));
      }

      await selectDock(page, "shop");
      const offer = page.locator("#shop-offers [data-offer]").first();
      const name = await offer.locator(".shop-unit-info strong").textContent();
      await activate(offer);
      await selectDock(page, "bench");
      const cell = '#cells button[data-x="0"][data-y="6"]';
      await activate(page.locator("#units [data-bench-slot='0'][data-unit]"));
      if (await page.locator("#unit-dialog").isVisible()) await activate(page.locator("#close-unit-dialog"));
      await activate(page.locator(cell));
      const waitForPlacement = () => page.waitForFunction(({ cell, name }) =>
        document.querySelector(cell)?.getAttribute("aria-label")?.includes(name), { cell, name });
      await waitForPlacement();
      assert.equal(await page.locator("#deployed").textContent(), "1/1");
      assert.equal(await page.locator("#units [data-unit]").count(), 0);
      assert.equal(await page.locator("#selected-unit-content .skill-card").count(), 1);
      await page.reload();
      await waitForPlacement();
      assert.equal(await page.locator("#room-code").textContent(), roomCode);

      const ready = page.locator("#ready");
      await activate(ready);
      await page.waitForFunction(() => document.querySelector("#phase").textContent.startsWith("전투"));
      await debugClick(page, "debug-second");
      await page.screenshot({ path: `${screenshots}/${mobile ? "mobile" : "pc"}-combat.png`, animations: "disabled" });
      await debugClick(page, "debug-next");
      await page.waitForFunction(() => document.querySelector("#phase").textContent.startsWith("라운드 결과"));
      assert.equal(textures.size, 20);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(mobile ? "Mobile" : "Desktop", "home, default roster, 20 textures, purchase, deployment, skill details, reconnect and bot battle verified.");
    }
  } finally {
    await browser?.close();
    processServer.kill("SIGTERM");
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
