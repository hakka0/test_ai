// Serve only built files under the same /test_ai/ path as GitHub Pages.
// No game backend is started; the suite rejects all matchmaking/WebSocket use.
const { createServer } = require("node:http");
const { readFile } = require("node:fs/promises");
const { resolve, extname } = require("node:path");
const assert = require("node:assert/strict");
const { chromium, browserOptions } = require("./browser-runtime.cjs");
const { debugClick } = require("./ui-helpers.cjs");
const root = resolve("dist-pages");
const prefix = "/test_ai/";
const failures = [];
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".ttf": "font/ttf" };
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const path = resolve(root, decodeURIComponent(pathname.slice(prefix.length)) || "index.html");
  if (!pathname.startsWith(prefix) || !path.startsWith(root + "/")) {
    failures.push(pathname); res.writeHead(404).end(); return;
  }
  try { const body = await readFile(path); res.writeHead(200, {"Content-Type": types[extname(path)] || "application/octet-stream"}).end(body); }
  catch { failures.push(pathname); res.writeHead(404).end(); }
});

async function main() {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  process.env.GAME_URL = `http://127.0.0.1:${server.address().port}${prefix}`;
  process.env.PAGES_TEST = "1";
  let browser;
  try {
    await require("./blue-archive.browser.cjs").main();
    browser = await chromium.launch(browserOptions());
    const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
    await context.addInitScript(() => {
      window.WebSocket = class { constructor() { throw new Error("No backend allowed"); } };
      window.fetch = () => { throw new Error("No backend allowed"); };
    });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(process.env.GAME_URL);
    assert.equal(await page.locator("#blue-archive-practice").count(), 0);
    assert.equal(await page.locator("#create").isVisible(), false);
    assert.equal(await page.locator("#join-form").isVisible(), false);
    await page.locator("#practice").tap();
    await page.waitForFunction(() => document.querySelector("#phase").textContent.startsWith("준비"));
    await debugClick(page, "debug-pause");
    await page.locator("#shop-offers [data-offer]:enabled").first().tap();
    await page.waitForFunction(() => document.querySelectorAll("#units [data-unit]").length === 1);
    assert.equal(await page.locator("#room-code-control").isVisible(), false);
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll("#units [data-unit]").length === 1);
    await page.locator("#leave").tap();
    await page.locator("#lobby").waitFor({state: "visible"});
    await page.reload();
    assert.equal(await page.locator("#game-view").isVisible(), false);
    await page.locator("#pvp-practice").tap();
    await page.waitForFunction(() => document.querySelectorAll("#player-ranking .ranking-row").length === 6);
    await debugClick(page, "debug-pause");
    await page.setViewportSize({width: 844, height: 390});
    await page.waitForFunction(() => document.documentElement.dataset.screenOrientation === "landscape");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await context.close();
    assert.deepEqual(failures, [], "Every requested asset is served beneath /test_ai/");
    console.log("Pages-only mobile practice: buy, restore, leave, six-player bot practice, no HTTP API or WebSocket, no missing assets.");
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
