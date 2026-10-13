// Test-only state injection compiles the real App, Play and fixture adapter.
// The shipped production export exposes no controls for changing round status.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const { build } = await import(process.env.ESBUILD_MODULE || "esbuild");
const dir = resolve("test/scratch/paused");
await mkdir(dir, { recursive: true });
await build({
  plugins: [
    {
      name: "exact-passport-files",
      setup(b) {
        b.onResolve({ filter: /\/passport$/i }, (args) => ({
          path: resolve(
            args.resolveDir,
            args.path + (args.path.endsWith("/Passport") ? ".tsx" : ".ts"),
          ),
        }));
      },
    },
  ],
  stdin: {
    contents: `import './main.tsx';import{demoRounds}from'./fixtures';window.setSales=(value)=>{demoRounds[0].salesEnabled=value;window.dispatchEvent(new Event('focus'));};`,
    resolveDir: resolve("web/src"),
    loader: "tsx",
  },
  outfile: dir + "/harness.js",
  jsx: "automatic",
  bundle: true,
  format: "esm",
  define: {
    "import.meta.env.BASE_URL": '"./"',
    "process.env.NODE_ENV": '"production"',
  },
});
const server = createServer(async (req, res) => {
  try {
    let p;
    if (req.url === "/") {
      res.setHeader("content-type", "text/html");
      res.end(
        '<div id="root"></div><link rel="stylesheet" href="harness.css"><script type="module" src="harness.js"></script>',
      );
      return;
    }
    p = req.url.startsWith("/harness.")
      ? dir + req.url
      : resolve("dist") + req.url;
    res.setHeader(
      "content-type",
      { ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp" }[
        extname(p)
      ] || "text/plain",
    );
    res.end(await readFile(p));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } }),
  results = [],
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("browser error:", m.text());
});
const cutoff = Date.parse("2026-10-18T00:00:00Z");
await page.clock.install({ time: cutoff - 60000 });
const btn = (name) => page.getByRole("button", { name, exact: true });
const url = `http://127.0.0.1:${server.address().port}/#play?game=0`;
try {
  await page.goto(url);
  await page
    .locator("#purchase-budget")
    .waitFor({ timeout: 5000 })
    .catch(async (e) => {
      console.log(await page.locator("body").innerText());
      throw e;
    });
  await page.evaluate(() =>
    localStorage.setItem(
      "sorphera.demo.passport.v1:demo-a",
      JSON.stringify({
        purchases: [
          {
            id: "clock-test",
            game: 0,
            round: "41",
            price: "5000000000000000",
            paid: 12,
            state: "finalized",
            at: 1,
            sample: true,
          },
        ],
        redemptions: [],
      }),
    ),
  );
  await page.reload();
  await page
    .locator("#purchase-budget")
    .waitFor({ timeout: 5000 })
    .catch(async (e) => {
      console.log(await page.locator("body").innerText());
      throw e;
    });
  await btn("Use free ticket").click();
  await page.getByRole("button", { name: /Quick Pick/ }).click();
  await page.getByRole("button", { name: /Add free ticket/ }).click();
  await page.getByRole("button", { name: /Review demo basket/ }).click();
  const before = await page.evaluate(() =>
    localStorage.getItem("sorphera.demo.passport.v1:demo-a"),
  );
  await page.clock.setFixedTime(cutoff - 58000);
  await page.evaluate(() => window.setSales(false));
  await page.waitForFunction(
    () =>
      document.querySelector("dialog .schedule-status")?.textContent ===
      "Sales paused",
  );
  assert.equal(await btn("Confirm demo entries").isDisabled(), true);
  await btn("Confirm demo entries").evaluate((b) => {
    b.disabled = false;
    b.click();
    b.disabled = true;
  });
  await page.waitForTimeout(100);
  assert.equal(
    await page
      .getByRole("heading", { name: "Your demo entries are in" })
      .count(),
    0,
  );
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("sorphera.demo.passport.v1:demo-a"),
    ),
    before,
  );
  results.push(
    "Open reward checkout reacts to sales pause; adversarial handler invocation rejects and preserves reward/Passport.",
  );
  await page.evaluate(() => window.setSales(true));
  await page.clock.setFixedTime(cutoff);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(
    () =>
      document.querySelector("dialog .schedule-status")?.textContent ===
      "Entries closed",
  );
  assert.equal(await btn("Confirm demo entries").isDisabled(), true);
  await btn("Confirm demo entries").evaluate((b) => {
    b.disabled = false;
    b.click();
    b.disabled = true;
  });
  await page.waitForTimeout(100);
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("sorphera.demo.passport.v1:demo-a"),
    ),
    before,
  );
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".reward-line").count(), 1);
  results.push(
    "Reward confirmation at cutoff rejects, keeps reserved draft and does not consume the earned reward.",
  );
  await page.goto(url.replace("#play?game=0", "#draw?game=0&round=42"));
  await page
    .getByRole("link", { name: "Explore next simulated round" })
    .click();
  await page
    .getByRole("link", { name: "Make your picks", exact: true })
    .click();
  await page
    .getByText("Saved drafts from other rounds", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove draft and release rewards" })
    .click();
  assert.equal(await btn("Use free ticket").isEnabled(), true);
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("sorphera.demo.passport.v1:demo-a"),
    ),
    before,
  );
  results.push(
    "Closed-round drafts stay accessible; explicit removal releases reserved rewards without changing the Passport.",
  );
  assert.deepEqual(errors, []);
} finally {
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/paused-checkout-results.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  await browser.close();
  server.close();
}
console.log(results.join("\n"));
