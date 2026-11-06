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
      await activate(page.locator("#blue-archive-practice"));
      await page.waitForFunction(() => document.querySelector("#deployed").textContent === "8/10");
      await debugClick(page, "debug-pause");
      assert.match(await page.locator("#level-label").textContent(), /레벨 10/);
      assert.equal(await page.locator("#units [data-unit]").count(), 12);
      assert.equal(await page.locator("#shop-offers .shop-portrait img[src^='/units/blue-archive/']").count(), 5);
      assert.equal(await page.locator("#gold").textContent(), "30");

      const roomCode = await page.locator("#room-code").textContent();
      const enemy = page.locator("#player-ranking [data-self='false']");
      const sizes = mobile ? [[390,844], [320,740], [844,390], [740,360], [667,375], [480,320], [390,844]]
        : [[1400,1000], [1024,768]];
      if (mobile) await activate(enemy);
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        await page.waitForFunction(({ mobile, width, height }) =>
          document.documentElement.dataset.screenMode === (mobile ? "mobile" : "pc")
          && document.documentElement.dataset.screenOrientation === (width > height ? "landscape" : "portrait"),
        { mobile, width, height });
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
        const viewed = page.locator("#cells button[aria-label*='관전 칸,']:not([aria-label*='빈 칸'])").first();
        await activate(viewed);
        assert.equal(await page.locator("#unit-dialog").getAttribute("data-read-only"), "true");
        await activate(page.locator("#close-unit-dialog"));
        await activate(page.locator("#scout-return"));
        await page.setViewportSize({ width: 844, height: 390 });
        await page.waitForFunction(() => document.documentElement.dataset.screenOrientation === "landscape");
      }

      const deploy = async (slot, x, expected) => {
        await selectDock(page, "bench");
        const reserve = page.locator(`#units [data-bench-slot="${slot}"]`);
        const cell = page.locator(`#cells button[data-x="${x}"][data-y="6"]`);
        await activate(reserve);
        if (await page.locator("#unit-dialog").isVisible()) await activate(page.locator("#close-unit-dialog"));
        await activate(cell);
        await page.waitForFunction(({ x, expected }) => document.querySelector(`#cells button[data-x="${x}"][data-y="6"]`).getAttribute("aria-label").includes(expected), { x, expected });
      };
      await deploy(0, 0, "아루");
      await deploy(1, 1, "하루나");
      assert.equal(await page.locator("#deployed").textContent(), "10/10");
      assert.equal(await page.locator("#units [data-unit]").count(), 10);
      assert.match(await page.locator("#selected-unit-content").textContent(), /미식가의 정밀탄/);
      await page.reload();
      await page.waitForFunction(() => document.querySelector("#deployed").textContent === "10/10");
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
      console.log(mobile ? "Mobile" : "Desktop", "20 textures, requested viewports, deployment, skill details, reconnect and bot battle verified.");
    }
  } finally {
    await browser?.close();
    processServer.kill("SIGTERM");
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
