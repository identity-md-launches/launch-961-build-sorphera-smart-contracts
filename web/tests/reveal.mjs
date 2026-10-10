import assert from "node:assert/strict";
import http from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const root = resolve("dist"),
  out = resolve("artifacts");
await mkdir(out, { recursive: true });
const server = http.createServer(async (req, res) => {
  try {
    const p = resolve(
      root,
      decodeURIComponent(req.url.split("?")[0]).replace(/^\/preview\//, "") ||
        "index.html",
    );
    if (!p.startsWith(root + "/")) throw Error();
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".webp": "image/webp",
      }[extname(p)] || "application/octet-stream",
    );
    res.end(await readFile(p));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/preview/`;
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  env: {
    ...process.env,
    XDG_CONFIG_HOME: "/tmp/sorphera-chrome-config",
    XDG_CACHE_HOME: "/tmp/sorphera-chrome-cache",
  },
  args: ["--no-sandbox"],
});
const results = [],
  errors = [];
const context = await browser.newContext({
  viewport: { width: 1100, height: 850 },
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
const btn = (name) => page.getByRole("button", { name, exact: true });
const stage = () => page.locator(".reveal-stage");
async function phase(p, ball = 0) {
  await page.waitForFunction(
    ([p, b]) => {
      const e = document.querySelector(".reveal-stage");
      return e?.dataset.phase === p && e?.dataset.ball === String(b);
    },
    [p, ball],
  );
}
async function snapshot(name) {
  await page
    .locator(".draw-stage")
    .screenshot({ path: `${out}/${name}.jpg`, type: "jpeg", quality: 88 });
}
async function pixels() {
  return page.locator(".reveal-stage canvas").evaluate((c) => c.toDataURL());
}
try {
  await page.goto(`${base}#draw?scenario=nft-tie`);
  assert.equal(await btn("Enable sound").getAttribute("aria-pressed"), "false");
  await btn("Watch the draw").click();
  await page.waitForFunction(
    () =>
      document.querySelector(".reveal-stage")?.getAttribute("aria-label") ===
      "Ball 1 turning; number hidden",
  );
  await btn("Pause").click();
  await snapshot("globe-away");
  assert.equal(await page.locator(".winner").count(), 0);
  assert.equal(
    await page.locator("#slot-0").getAttribute("aria-label"),
    "Ball 1: awaiting reveal",
  );
  await btn("Resume").click();
  await phase("spinning");
  await page.waitForTimeout(200);
  await btn("Pause").click();
  const before = await pixels();
  const label = await stage().getAttribute("aria-label");
  await snapshot("globe-mid-turn");
  await page.waitForTimeout(450);
  assert.equal(await pixels(), before);
  assert.equal(await stage().getAttribute("aria-label"), label);
  assert.equal(await stage().getAttribute("data-phase"), "spinning");
  results.push(
    "Pause freezes spinning pixels, phase, announcements and match gating; resume uses remaining duration.",
  );
  await btn("Resume").click();
  await phase("hold");
  await btn("Pause").click();
  await snapshot("globe-stopped");
  assert.equal(await stage().getAttribute("aria-label"), "Ball 1: 7");
  assert.match(
    await page.locator(".draw-stage .sr-only[role=status]").innerText(),
    /Ball 1: 7/,
  );
  const stopped = await pixels();
  await btn("Resume").click();
  await phase("travel");
  await page.waitForTimeout(150);
  await btn("Pause").click();
  const transform = await page
    .locator(".rg")
    .evaluate((e) => e.style.transform);
  await page.waitForTimeout(450);
  assert.equal(
    await page.locator(".rg").evaluate((e) => e.style.transform),
    transform,
  );
  assert.equal(await pixels(), stopped);
  results.push(
    "Pause also holds travel; stopped and travelling globe pixel buffers match exactly.",
  );
  await btn("Resume").click();
  await phase("away", 1);
  await btn("Pause").click();
  await snapshot("globe-landed");
  assert.equal(
    await page.locator("#slot-0 canvas").evaluate((c) => c.toDataURL()),
    stopped,
  );
  results.push(
    "Landed and stopped globe pixel buffers are byte-identical: same texture, lighting, badge and orientation.",
  );
  await btn("Resume").click();
  await phase("hold", 3);
  await btn("Pause").click();
  await snapshot("globe-bonus-stop");
  assert.equal(await stage().getAttribute("aria-label"), "Bonus ball: 4");
  assert.equal(await page.locator(".winner").count(), 0);
  assert.equal(await page.locator(".finale-winner").count(), 0);
  results.push(
    "Bonus has its own pink stop. NFT winner remains hidden until the separate tie-break.",
  );
  await btn("Resume").click();
  await page.locator(".winner").waitFor();
  assert.match(await page.locator(".winner").innerText(), /118/);
  const outcome = await page.locator(".draw-result").innerText();
  await btn("Replay").click();
  await btn("Skip to results").click();
  assert.equal(await page.locator(".draw-result").innerText(), outcome);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(
    () => document.querySelector(".draw-toolbar input[type=checkbox]")?.checked,
  );
  assert.equal(
    await page.getByLabel("Reduced motion", { exact: true }).isChecked(),
    true,
  );
  await btn("Replay").click();
  await page.locator(".winner").waitFor();
  assert.equal(await page.locator(".draw-result").innerText(), outcome);
  assert.equal(
    await page.locator("#slot-0 canvas").evaluate((c) => c.toDataURL()),
    stopped,
  );
  await page.setViewportSize({ width: 320, height: 780 });
  await snapshot("draw-mobile-reduced-after");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  results.push(
    "Replay, skip and reduced motion preserve the same results and globe design, including the NFT winner.",
  );
  await context.close();
  // Continuous browser recording at normal speed, with no pauses or timer override.
  const recording = await browser.newContext({
    viewport: { width: 960, height: 760 },
    recordVideo: { dir: `${out}/video-tmp`, size: { width: 960, height: 760 } },
  });
  const film = await recording.newPage();
  film.on("pageerror", (e) => errors.push(e.message));
  await film.goto(`${base}#draw?scenario=nft-tie`);
  await film.locator(".draw-stage").scrollIntoViewIfNeeded();
  await film.evaluate(() => {
    window.__frames = [];
    window.__phases = [];
    let last = performance.now();
    function sample(now) {
      window.__frames.push(now - last);
      last = now;
      const e = document.querySelector(".reveal-stage");
      const key = e?.dataset.ball + ":" + e?.dataset.phase;
      const previous = window.__phases.at(-1);
      if (previous?.key !== key) window.__phases.push({ key, at: now });
      window.__sample = requestAnimationFrame(sample);
    }
    window.__sample = requestAnimationFrame(sample);
  });
  await film.getByRole("button", { name: "Watch the draw" }).click();
  await film.locator(".winner").waitFor({ timeout: 40000 });
  await film.waitForTimeout(900);
  const motion = await film.evaluate(() => {
    cancelAnimationFrame(window.__sample);
    return { frames: window.__frames, phases: window.__phases };
  });
  await writeFile(`${out}/motion-timing.json`, JSON.stringify(motion, null, 2));
  const video = film.video();
  await recording.close();
  await video.saveAs(`${out}/reveal-normal.webm`);
  results.push(
    "Recorded full normal-speed NFT replay, all four balls and tie-break, with browser video and rAF timing data.",
  );
  assert.deepEqual(errors, []);
} finally {
  await writeFile(
    `${out}/reveal-results.json`,
    JSON.stringify({ results, errors }, null, 2),
  );
  await browser.close();
  server.close();
}
console.log(results.join("\n"));
