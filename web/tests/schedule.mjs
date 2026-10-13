// Production-export interactions with controlled browser clocks. Run from root.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
const { chromium, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const out = "artifacts";
await mkdir(out, { recursive: true });
const root = resolve("dist");
const server = createServer(async (req, res) => {
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
const engine = process.env.BROWSER === "webkit" ? webkit : chromium;
const browser = await engine.launch({
  headless: true,
  timeout: 20000,
  ...(engine === chromium
    ? {
        args: [
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
        ],
      }
    : {}),
});
const results = [],
  errors = [];
async function run(name, fn) {
  await fn();
  results.push(name);
  console.log("PASS", name);
}
const cutoff = Date.parse("2026-10-18T00:00:00Z");
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  timezoneId: "America/New_York",
});
context.on("page", (p) => {
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("response", (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
});
const page = await context.newPage();
await page.clock.install({ time: cutoff - 120000 });
const btn = (name) => page.getByRole("button", { name, exact: true });
const review = () => page.getByRole("button", { name: /Review demo basket/ });
async function go(route) {
  await page.goto(base + route);
  await page.locator("main").waitFor();
}
async function generate(n = 1) {
  await page
    .getByLabel("Generate different entries", { exact: true })
    .fill(String(n));
  await page
    .getByRole("button", {
      name: `Generate ${n} different entries`,
      exact: true,
    })
    .click();
}
try {
  await run(
    "Default draw room is upcoming ETH round, no reveal or invented results",
    async () => {
      await go("#draw");
      await page
        .getByRole("heading", { name: "ETH jackpot · Round 42" })
        .waitFor();
      assert.equal(await page.locator(".reveal-stage").count(), 0);
      assert.match(
        await page.locator(".schedule-draw").innerText(),
        /Draw window opens in/,
      );
      assert.match(await page.locator(".schedule-sales").innerText(), /0[12]m/);
      assert.match(
        await page.locator(".schedule-sales time").innerText(),
        /EDT/,
      );
      assert.equal(
        await page.locator(".schedule-sales time").getAttribute("datetime"),
        "2026-10-18T00:00:00.000Z",
      );
      assert.match(
        await page.locator(".upcoming-draw").innerText(),
        /No confirmed result/,
      );
      await page.screenshot({
        path: `${out}/upcoming-desktop.jpg`,
        type: "jpeg",
        quality: 82,
      });
    },
  );
  await run("Independent NFT switch and exact UTC timestamps", async () => {
    await page.getByRole("link", { name: "NFT jackpot", exact: true }).click();
    await page
      .getByRole("heading", { name: "NFT jackpot · Round 42" })
      .waitFor();
    assert.equal(
      await page.locator(".schedule-draw time").getAttribute("datetime"),
      "2026-10-18T01:30:00.000Z",
    );
  });
  await run(
    "Distinct calendar downloads have correct times, round URLs and delay caveat",
    async () => {
      for (const [name, expected] of [
        ["Add draw-window opening to calendar", "20261018T013000Z"],
        ["Add sales-closing reminder", "20261018T010000Z"],
      ]) {
        const event = page.waitForEvent("download");
        await btn(name).click();
        const download = await event;
        const body = (await readFile(await download.path(), "utf8")).replace(
          /\r\n /g,
          "",
        );
        assert.match(body, new RegExp("DTSTART:" + expected));
        assert.match(body, /#draw\?game=1&round=42/);
        assert.match(body, /Delays are possible/);
        await writeFile(`${out}/${download.suggestedFilename()}`, body);
      }
    },
  );
  await run(
    "Open checkout closes exactly at cutoff, handlers reject, drafts and Passport preserved",
    async () => {
      await go("#play?game=0");
      await page.locator("#purchase-budget").fill("24.50");
      await generate();
      await review().click();
      const before = await page.evaluate(() =>
        localStorage.getItem("sorphera.demo.passport.v1:demo-a"),
      );
      await page.clock.setFixedTime(cutoff);
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page.waitForFunction(
        () =>
          document.querySelector("dialog .schedule-sales strong")
            ?.textContent === "Entries closed",
      );
      assert.equal(await btn("Confirm demo entries").isDisabled(), true);
      await btn("Confirm demo entries").evaluate((b) => {
        b.disabled = false;
        b.click();
        b.disabled = true;
      });
      await page.waitForTimeout(50);
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
      assert.equal(await page.locator("#review-budget").inputValue(), "24.50");
      await page.locator("dialog").screenshot({
        path: `${out}/checkout-cutoff.jpg`,
        type: "jpeg",
        quality: 80,
      });
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("dialog").count(), 0);
      assert.equal(await page.locator(".ticket-line").count(), 1);
      assert.equal(await review().isDisabled(), true);
      await page.reload();
      await page.locator(".ticket-line").waitFor();
      assert.equal(await page.locator(".ticket-line").count(), 1);
      assert.equal(await review().isDisabled(), true);
    },
  );
  await run(
    "Draw window and suspended-tab recovery cannot generate results or reopen sales",
    async () => {
      await go("#draw?game=0&round=42");
      await page.clock.setFixedTime(cutoff + 1800000);
      await page.evaluate(() =>
        document.dispatchEvent(new Event("visibilitychange")),
      );
      await page
        .getByText("Preparing the prize pool", { exact: true })
        .first()
        .waitFor();
      assert.equal(await page.locator(".reveal-stage").count(), 0);
      assert.equal(await page.locator(".winner").count(), 0);
      assert.match(
        await page.locator(".schedule-draw").innerText(),
        /Draw window opened/,
      );
      await page.clock.setFixedTime(cutoff + 8 * 86400000);
      await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
      assert.equal(
        await page.locator(".schedule-sales time").getAttribute("datetime"),
        "2026-10-18T00:00:00.000Z",
      );
      await page.reload();
      await page.locator(".schedule-sales time").waitFor();
      assert.equal(
        await page.locator(".schedule-sales time").getAttribute("datetime"),
        "2026-10-18T00:00:00.000Z",
      );
      assert.match(
        await page.locator(".upcoming-draw").innerText(),
        /Preparing the prize pool/,
      );
    },
  );
  await run(
    "Later round has distinct identity and old deep link keeps the old deadline",
    async () => {
      await page
        .getByRole("link", { name: "Explore next simulated round" })
        .click();
      await page
        .getByRole("heading", { name: "ETH jackpot · Round 43" })
        .waitFor();
      assert.equal(
        await page.locator(".schedule-sales time").getAttribute("datetime"),
        "2026-10-25T00:00:00.000Z",
      );
      await go("#draw?game=0&round=42");
      await page.locator(".schedule-sales time").waitFor();
      assert.equal(
        await page.locator(".schedule-sales time").getAttribute("datetime"),
        "2026-10-18T00:00:00.000Z",
      );
    },
  );
  await run(
    "Receipt and My tickets open the exact game/round after reload",
    async () => {
      await page.clock.setFixedTime(cutoff - 120000);
      await page.evaluate(() => {
        localStorage.setItem("sorphera.demo.schedule.v2:0", "42");
      });
      await go("#play?game=1");
      await generate();
      await review().click();
      await btn("Confirm demo entries").click();
      await page
        .getByRole("heading", { name: "Your demo entries are in" })
        .waitFor();
      assert.equal(
        await page.locator("dialog .round-schedule time").count(),
        2,
      );
      assert.equal(
        await page
          .getByRole("link", { name: "View your draw", exact: true })
          .getAttribute("href"),
        "#draw?game=1&round=42",
      );
      await page
        .getByRole("link", { name: "View your draw", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "NFT jackpot · Round 42" })
        .waitFor();
      assert.equal(await page.locator(".reveal-stage").count(), 0);
      await go("#tickets");
      assert.equal(
        await page
          .getByRole("link", { name: "View your draw", exact: true })
          .count(),
        1,
      );
      await page.reload();
      await page
        .getByRole("link", { name: "View your draw", exact: true })
        .waitFor();
      await page
        .getByRole("link", { name: "View your draw", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "NFT jackpot · Round 42" })
        .waitFor();
    },
  );
  await run(
    "Unknown game-round/replay does not silently substitute an outcome",
    async () => {
      await go("#draw?game=1&round=999999");
      await page
        .getByText("Schedule unavailable for this exact round.", {
          exact: false,
        })
        .waitFor();
      assert.equal(await page.locator(".reveal-stage").count(), 0);
      await go("#draw?game=2&round=42");
      await page.getByRole("heading", { name: "Game unavailable" }).waitFor();
      await go("#draw?scenario=unknown");
      await page.getByRole("heading", { name: "Replay unavailable" }).waitFor();
      assert.equal(await page.locator(".reveal-stage").count(), 0);
    },
  );
  await run(
    "Keyboard primary action, focus ring, reduced motion and 320/390/768/1440 reflow",
    async () => {
      await page.goto("about:blank");
      await go("#home");
      await page.keyboard.press("Tab");
      assert.match(await page.locator(":focus").innerText(), /Skip to content/);
      await page.keyboard.press("Enter");
      assert.equal(
        await page
          .locator("main")
          .evaluate((e) => document.activeElement === e),
        true,
      );
      await page
        .getByRole("link", { name: "Make your picks", exact: true })
        .focus();
      assert.notEqual(
        await page
          .locator(":focus")
          .evaluate((e) => getComputedStyle(e).outlineStyle),
        "none",
      );
      await page.keyboard.press("Enter");
      await page.locator("#purchase-budget").waitFor();
      await page.emulateMedia({ reducedMotion: "reduce" });
      for (const width of [320, 390, 768, 1440])
        for (const route of [
          "#home",
          "#draw?game=1&round=42",
          "#play?game=1",
          "#tickets",
        ]) {
          await page.setViewportSize({ width, height: 844 });
          await go(route);
          await page.waitForTimeout(150);
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
            `Overflow ${width} ${route}`,
          );
          if (width === 390) {
            const name = route.split("?")[0].slice(1);
            if (name === "play")
              await page.locator(".round-facts").screenshot({
                path: `${out}/play-schedule-390.jpg`,
                type: "jpeg",
                quality: 85,
              });
            await page.screenshot({
              path: `${out}/${name}-390.jpg`,
              type: "jpeg",
              quality: 82,
              fullPage: name === "draw",
            });
          }
        }
    },
  );
  await run(
    "Delayed draw, NFT tie delay, rollover and cancellation fixtures remain labelled simulations",
    async () => {
      for (const [id, label] of [
        ["oracle", "Waiting for confirmed numbers"],
        ["tie-delay", "tie-break"],
        ["eth-roll", "rolls"],
        ["nft-roll", "rolls"],
        ["cancel", "Cancelled"],
      ]) {
        await go("#draw?scenario=" + id);
        await btn("Skip to results").click();
        assert.match(
          await page.locator(".draw-result").innerText(),
          new RegExp(label, "i"),
        );
        assert.match(await page.locator("main").innerText(), /Simulation only/);
        if (
          ["tie-delay", "eth-roll", "nft-roll", "cancel", "oracle"].includes(id)
        )
          assert.equal(await page.locator(".winner").count(), 0);
      }
    },
  );
  assert.deepEqual(errors, []);
} finally {
  await writeFile(
    `${out}/schedule-${process.env.BROWSER || "chromium"}-results.json`,
    JSON.stringify({ results, errors }, null, 2),
  );
  await browser.close();
  server.close();
}
