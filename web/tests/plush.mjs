// Run from the repository root with external Playwright/esbuild tooling.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const { build } = await import(process.env.ESBUILD_MODULE || "esbuild");
const out = "test/scratch/plush";
await mkdir(out, { recursive: true });
const result = await build({
  entryPoints: ["web/src/plushModel.ts"],
  bundle: true,
  format: "esm",
  write: false,
  define: { "import.meta.env.BASE_URL": '"./"' },
});
const html = `<html><head><style>body{background:#19171c;color:#f7ecdf;font:16px Arial;margin:24px}section{display:flex;align-items:center;gap:18px;margin:24px 0}figure{margin:0;text-align:center}canvas,img{object-fit:contain;display:block}figcaption{margin-top:8px;font-size:12px}h1{font-size:24px}h2{font-size:18px}</style></head><body><h1>Photographic reference / shared plush model</h1><div id="comparison"></div><h2>Same model through a half-turn · blank badge</h2><div id="turns"></div><h2>Atlas material variants</h2><div id="atlas"></div><script type="module">
import{loadPlushModel,renderPlush}from './model.js';await loadPlushModel();window.render=renderPlush;
function canvas(section,kind,angle,number,size,label){const f=document.createElement('figure');const c=document.createElement('canvas');c.width=c.height=256;c.style.width=c.style.height=size+'px';renderPlush(c,kind,angle,number);f.append(c);const cap=document.createElement('figcaption');cap.textContent=label;f.append(cap);section.append(f);return c}
for(const kind of ['eth','nft']){const s=document.createElement('section');comparison.append(s);for(const size of [56,185]){const f=document.createElement('figure');f.innerHTML='<img src="./brand/'+kind+'-ball.webp" width="'+size+'" height="'+size+'"><figcaption>Reference '+size+'px</figcaption>';s.append(f);canvas(s,kind,0,kind==='eth'?7:4,size,'Model '+size+'px');}}
for(const kind of ['eth','nft']){const s=document.createElement('section');turns.append(s);for(const deg of [0,45,90,135,180])canvas(s,kind,deg*Math.PI/180,undefined,150,kind+' '+deg+'°');}
const s=document.createElement('section');atlas.append(s);for(const kind of ['ca','jp','br'])canvas(s,kind,0,kind.toUpperCase(),150,kind.toUpperCase());window.ready=true;
</script></body></html>`;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/comparison.html") {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(html);
      return;
    }
    if (url.pathname === "/model.js") {
      res.setHeader("content-type", "text/javascript");
      res.end(result.outputFiles[0].text);
      return;
    }
    const p = resolve(
      "dist",
      "." + url.pathname.replace(/^\/preview/, ""),
      url.pathname.endsWith("/") ? "index.html" : "",
    );
    if (!p.startsWith(resolve("dist") + "/")) throw Error("outside");
    res.setHeader(
      "content-type",
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".webp": "image/webp",
      }[extname(p)] || "application/octet-stream",
    );
    res.end(await readFile(p));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const errors = [];
const records = {};
try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 1100 },
    deviceScaleFactor: 2,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/comparison.html");
  await page.waitForFunction(() => window.ready);
  await page.screenshot({ path: out + "/comparison.png", fullPage: true });
  records.mesh = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");
    const frames = [];
    const durations = [];
    for (const a of [0, 0.2, 0.8, Math.PI / 2, Math.PI]) {
      ctx.clearRect(0, 0, 256, 256);
      const start = performance.now();
      window.render(c, "eth", a, 7);
      durations.push(performance.now() - start);
      frames.push(c.toDataURL());
    }
    const inks = [];
    for (let n = 1; n <= 20; n++) {
      ctx.clearRect(0, 0, 256, 256);
      window.render(c, "eth", 0, n);
      inks.push(c.toDataURL());
    }
    ctx.clearRect(0, 0, 256, 256);
    window.render(c, "eth", Math.PI, undefined);
    const backBlank = c.toDataURL();
    const symbols = [];
    for (const symbol of [undefined, "?", "+1", "CA", "JP", "BR"]) {
      ctx.clearRect(0, 0, 256, 256);
      window.render(c, "eth", 0, symbol);
      symbols.push(c.toDataURL());
    }
    return {
      renderer: c.dataset.renderer,
      uniqueViews: new Set(frames).size,
      uniqueNumbers: new Set(inks).size,
      backHidesPrint: backBlank === frames[4],
      uniqueSymbols: new Set(symbols).size,
      durations,
    };
  });
  assert.equal(records.mesh.uniqueViews, 5);
  assert.equal(records.mesh.uniqueNumbers, 20);
  assert.equal(records.mesh.uniqueSymbols, 6);
  assert.equal(records.mesh.backHidesPrint, true);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(base + "/preview/#home");
    await page.waitForSelector("canvas[data-renderer]");
    await page.screenshot({ path: out + "/home-" + width + ".png" });
    records["layout" + width] = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      action: document.querySelector(".hero-actions").getBoundingClientRect()
        .bottom,
      jackpot: document
        .querySelector(".jackpot-amount h3")
        .getBoundingClientRect().bottom,
    }));
    assert.equal(records["layout" + width].overflow, false);
    if (width === 390) {
      assert.ok(records.layout390.action < 844);
      assert.ok(records.layout390.jackpot < 844);
    }
  }
  const fallback = await browser.newPage({
    viewport: { width: 1000, height: 1100 },
    deviceScaleFactor: 2,
  });
  await fallback.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === "webgl" || type === "webgl2") return null;
      return get.call(this, type, ...args);
    };
  });
  await fallback.goto(base + "/comparison.html");
  await fallback.waitForFunction(() => window.ready);
  assert.equal(
    await fallback.locator("canvas").first().getAttribute("data-renderer"),
    "mesh-canvas",
  );
  await fallback.screenshot({ path: out + "/fallback.png", fullPage: true });
  assert.deepEqual(errors, []);
  records.errors = errors;
  await writeFile(out + "/results.json", JSON.stringify(records, null, 2));
  console.log(JSON.stringify(records, null, 2));
} finally {
  await browser.close();
  server.close();
}
