// Run from repository root. Install Playwright in a temporary tooling directory;
// set PLAYWRIGHT_MODULE and PLAYWRIGHT_BROWSERS_PATH if it is not on Node's path.
import assert from "node:assert/strict";
import http from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const out = resolve("artifacts");
await mkdir(out, { recursive: true });
const root = resolve("dist");
const server = http.createServer(async (req, res) => {
  try {
    const p = resolve(
      root,
      decodeURIComponent(req.url.split("?")[0]).replace(/^\/preview\//, "") ||
        "index.html",
    );
    if (!p.startsWith(root + "/")) throw Error("outside export");
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
async function run(name, fn) {
  await fn();
  results.push(name);
  console.log("PASS", name);
}
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
context.on("page", (p) => {
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("response", (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
});
const page = await context.newPage();
async function fresh(url) {
  await page.goto("about:blank");
  await page.goto(url);
}
const button = (name, scope = page) =>
  scope.getByRole("button", { name, exact: true });
const budget = () => page.locator("#purchase-budget");
const generate = () =>
  page.getByRole("button", { name: /^Generate .*different entries$/ });
const review = () => page.getByRole("button", { name: /Review demo basket/ });
const confirm = () => button("Confirm demo entries");
const receipt = () =>
  page.getByRole("heading", { name: "Your demo entries are in" });
async function blocked(target) {
  assert.equal(await target.isDisabled(), true);
  // Adversarial UI check: invoke the real handler even if someone changes
  // the DOM disabled state. The handler must still reject the purchase.
  await target.evaluate((el) => {
    el.disabled = false;
    el.click();
    el.disabled = true;
  });
  await page.waitForTimeout(50);
  assert.equal(await receipt().count(), 0);
}
try {
  for (const game of [0, 1])
    await run(
      `Game ${game}: budget boundaries, real review/confirm guards, rejection and duplicate clicks`,
      async () => {
        await fresh(`${base}#play?game=${game}`);
        assert.equal(await budget().inputValue(), "30");
        assert.equal(
          await page
            .getByLabel("Generate different entries", { exact: true })
            .inputValue(),
          "2",
        );
        await page
          .getByLabel("Generate different entries", { exact: true })
          .fill("3");
        await generate().click();
        assert.match(
          await page.locator(".ticket-slip").innerText(),
          /US\$38.50/,
        );
        assert.match(
          await page.locator(".ticket-slip").innerText(),
          /This purchase is US\$8.50 over your US\$30.00 budget/,
        );
        if (game === 0)
          await page.setViewportSize({ width: 1280, height: 1500 });
        if (game === 0)
          await page.locator(".ticket-slip").screenshot({
            path: `${out}/budget-after.jpg`,
            type: "jpeg",
            quality: 85,
          });
        await blocked(review());
        assert.equal(await page.locator("dialog").count(), 0);
        await budget().fill("40");
        await review().click();
        await page.locator("#review-budget").fill("30");
        await blocked(confirm());
        if (game === 0)
          await page.locator("dialog").screenshot({
            path: `${out}/review-after.jpg`,
            type: "jpeg",
            quality: 85,
          });
        for (const value of ["", "0", "-30", "invalid", "1e6", "30."]) {
          await page.locator("#review-budget").fill(value);
          await blocked(confirm());
          assert.equal(
            await page.locator("#review-budget").inputValue(),
            value,
          );
        }
        await page.locator("#review-budget").fill("30");
        await button("Close dialog").click();
        await button("Remove line 3").click();
        await budget().fill("26.00");
        assert.equal(await review().isEnabled(), true);
        await review().click();
        await page.locator("#review-budget").fill("25.99");
        await blocked(confirm());
        await page.locator("#review-budget").fill("26");
        await page
          .getByText("Optional failure demonstration", { exact: true })
          .click();
        await page
          .getByLabel("Simulate a rejected approval instead of confirming")
          .check();
        await confirm().click();
        assert.match(
          await page.locator("dialog").innerText(),
          /approval rejected/,
        );
        assert.equal(await page.locator(".review-lines > div").count(), 2);
        assert.equal(await page.locator("#review-budget").inputValue(), "26");
        await page
          .getByLabel("Simulate a rejected approval instead of confirming")
          .uncheck();
        await confirm().click();
        // Force an edit during the pending interval; the acceptance recheck must
        // read the current budget instead of the earlier review snapshot.
        await page.locator("#review-budget").evaluate((el) => {
          el.disabled = false;
        });
        await page.locator("#review-budget").fill("25.99");
        await page.waitForTimeout(800);
        assert.equal(await receipt().count(), 0);
        assert.equal(await page.locator(".review-lines > div").count(), 2);
        assert.equal(
          await page.locator("#review-budget").inputValue(),
          "25.99",
        );
        await page.locator("#review-budget").fill("26");
        await confirm().evaluate((el) => {
          for (let i = 0; i < 8; i++) {
            el.disabled = false;
            el.click();
            el.disabled = true;
          }
        });
        assert.equal(await confirm().isDisabled(), true);
        await receipt().waitFor();
        assert.equal(await page.locator(".receipt-balls > .balls").count(), 2);
        assert.match(await page.locator(".receipt").innerText(), /US\$26.00/);
        await button("Close dialog").click();
        assert.equal(await budget().inputValue(), "26");
        assert.equal(await page.locator(".ticket-line").count(), 0);
        await page
          .getByRole("link", { name: "My tickets", exact: true })
          .first()
          .click();
        await page.getByRole("heading", { name: "Your demo entry", exact: true }).first().waitFor();
        // A repeated confirm may never add extra personal tickets.
        assert.equal(
          await page
            .getByRole("heading", { name: "Your demo entry", exact: true })
            .count(),
          2,
        );
        assert.equal(await page.locator(".my-ticket").count(), 7);
      },
    );
  await run(
    "Independent saved baskets, budget navigation, no-ticket generator and transaction limit",
    async () => {
      await fresh(`${base}#play`);
      await generate().click();
      await page
        .getByRole("button", { name: "NFT jackpot", exact: true })
        .click();
      assert.equal(await page.locator(".ticket-line").count(), 0);
      await budget().fill("10");
      assert.equal(await generate().isDisabled(), true);
      assert.match(
        await page.locator(".budget-answer").innerText(),
        /Not even one ticket fits/,
      );
      await page.getByRole("link", { name: "Home", exact: true }).click();
      await page.getByRole("link", { name: "Play", exact: true }).click();
      assert.equal(await budget().inputValue(), "10");
      assert.equal(await page.locator(".ticket-line").count(), 2);
      assert.equal(await review().isDisabled(), true);
      await page
        .getByRole("button", { name: "NFT jackpot", exact: true })
        .click();
      await budget().fill("30");
      await generate().click();
      await page
        .getByRole("button", { name: /^ETH jackpot/ })
        .first()
        .click();
      assert.equal(await page.locator(".ticket-line").count(), 2);
      await budget().fill("26");
      await review().click();
      await confirm().click();
      await receipt().waitFor();
      await button("Close dialog").click();
      await page
        .getByRole("button", { name: /^NFT jackpot/ })
        .first()
        .click();
      assert.equal(await page.locator(".ticket-line").count(), 2);
      assert.equal(await budget().inputValue(), "26");
      await button("Quick Pick").click();
      await page.getByLabel("Repeat these numbers").fill("101");
      await page.getByRole("button", { name: /Add to basket/ }).click();
      assert.match(await page.locator("#ticket-error").innerText(), /100/);
      assert.equal(await page.locator(".ticket-line").count(), 2);
    },
  );
  await run(
    "Basket changed during pending: no stale entries accepted",
    async () => {
      await fresh(`${base}#play`);
      await generate().click();
      await review().click();
      await confirm().click();
      await page
        .getByRole("button", { name: "Remove line 2", exact: true })
        .evaluate((el) => el.click());
      await page.waitForTimeout(800);
      assert.equal(await receipt().count(), 0);
      assert.match(
        await page.locator("dialog").innerText(),
        /Your basket changed/,
      );
      assert.equal(await page.locator(".review-lines > div").count(), 1);
      assert.equal(await page.locator("#review-budget").inputValue(), "30");
      await button("Close dialog").click();
      assert.equal(await page.locator(".ticket-line").count(), 1);
    },
  );
  await run(
    "Round closes after review: confirmation rejected and draft retained",
    async () => {
      await fresh(`${base}#play`);
      await generate().click();
      await review().click();
      const cutoff = await page
        .locator(".round-facts time")
        .getAttribute("datetime");
      await page.clock.setFixedTime(new Date(Date.parse(cutoff) + 1000));
      await page.locator("#review-budget").fill("31");
      await blocked(confirm());
      assert.equal(await page.locator(".review-lines > div").count(), 2);
      await page.clock.setFixedTime(new Date());
    },
  );
  await run(
    "Homepage and neutral NFT claim with retry and receipt",
    async () => {
      await fresh(base);
      assert.equal(
        await page
          .getByText("Meet the little worlds.", { exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page
          .getByText("NFT jackpot prizes come from FWA pulls.", {
            exact: false,
          })
          .count(),
        1,
      );
      await page.screenshot({
        path: `${out}/home-after.jpg`,
        type: "jpeg",
        quality: 75,
        fullPage: true,
      });
      await page.getByRole("link", { name: "My tickets", exact: true }).click();
      await page
        .locator(".my-ticket")
        .filter({ hasText: "Sample ticket #118" })
        .getByRole("button", { name: "Claim demo prize" })
        .click();
      assert.equal(await page.locator(".asset-outcomes li").count(), 6);
      assert.equal(
        await page
          .locator(".asset-outcomes canvas, .asset-outcomes img")
          .count(),
        0,
      );
      assert.match(await page.locator("dialog").innerText(), /Demo NFT 1/);
      await button("Claim 6 demo NFTs").click();
      await button("All 6 demo NFTs simulated").waitFor();
      await page.locator("dialog").screenshot({
        path: `${out}/claim-after.jpg`,
        type: "jpeg",
        quality: 85,
      });
      await fresh(`${base}#tickets`);
      await page
        .locator(".my-ticket")
        .filter({ hasText: "Sample ticket #118" })
        .getByRole("button", { name: "Claim demo prize" })
        .click();
      await page
        .getByText("Demo scenarios: failed delivery and rejection", {
          exact: true,
        })
        .click();
      await page
        .getByLabel(
          "One asset fails on the first attempt, then succeeds on retry",
        )
        .check();
      await button("Claim 6 demo NFTs").click();
      await button("Retry remaining assets").waitFor();
      assert.equal(
        await page
          .locator(".asset-outcomes li")
          .filter({ hasText: "delivered" })
          .count(),
        5,
      );
      await button("Retry remaining assets").click();
      await button("All 6 demo NFTs simulated").waitFor();
      assert.equal(
        await page
          .locator(".asset-outcomes li")
          .filter({ hasText: "delivered" })
          .count(),
        6,
      );
    },
  );
  await run(
    "All routes reflow at 320, 390, 768 and 1440 CSS pixels",
    async () => {
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const route of [
          "home",
          "play",
          "draw",
          "tickets",
          "history",
          "faq",
        ]) {
          await fresh(`${base}#${route}`);
          await page.locator("main").waitFor();
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          );
          assert.equal(overflow, false, `${route} at ${width}`);
        }
      }
    },
  );
  await run(
    "Keyboard review, focus trap, Escape return and narrow purchase layout",
    async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await fresh(`${base}#play`);
      await generate().focus();
      await page.keyboard.press("Enter");
      await review().focus();
      await page.keyboard.press("Enter");
      await page.locator("dialog").waitFor();
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press("Tab");
        assert.equal(
          await page.evaluate(
            () => document.activeElement.closest("dialog") !== null,
          ),
          true,
        );
      }
      await page.keyboard.press("Escape");
      assert.equal(
        await review().evaluate((el) => el === document.activeElement),
        true,
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `${out}/play-mobile-after.jpg`,
        type: "jpeg",
        quality: 80,
        fullPage: true,
      });
    },
  );
  await run(
    "Measured opaque contrast pairs and 200% text enlargement",
    async () => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await fresh(`${base}#play`);
      await generate().click();
      await review().focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      await page.screenshot({
        path: `${out}/keyboard-focus.jpg`,
        type: "jpeg",
        quality: 80,
      });
      const pairs = await page.evaluate(() => {
        function rgb(s) {
          return s
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number);
        }
        function lum(s) {
          const [r, g, b] = rgb(s).map((v) => {
            v /= 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }
        function ratio(a, b) {
          const x = lum(a),
            y = lum(b);
          return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
        }
        const input = getComputedStyle(
          document.querySelector("#purchase-budget"),
        );
        const answer = getComputedStyle(
          document.querySelector(".budget-answer"),
        );
        const text = getComputedStyle(
          document.querySelector(".budget-answer span"),
        );
        const action = getComputedStyle(
          document.querySelector(".ticket-slip button.primary"),
        );
        return [
          {
            name: "Budget input",
            foreground: input.color,
            background: input.backgroundColor,
            ratio: ratio(input.color, input.backgroundColor),
          },
          {
            name: "Budget explanation",
            foreground: text.color,
            background: answer.backgroundColor,
            ratio: ratio(text.color, answer.backgroundColor),
          },
          {
            name: "Review action",
            foreground: action.color,
            background: action.backgroundColor,
            ratio: ratio(action.color, action.backgroundColor),
          },
        ];
      });
      for (const pair of pairs)
        assert.ok(pair.ratio >= 4.5, JSON.stringify(pair));
      await writeFile(`${out}/contrast.json`, JSON.stringify(pairs, null, 2));
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(
        () => (document.documentElement.style.fontSize = "32px"),
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      // CSS text enlargement only; do not represent this as native browser zoom.
      await review().click();
      assert.equal(await confirm().isEnabled(), true);
    },
  );
  assert.deepEqual(errors, []);
} finally {
  await writeFile(
    `${out}/browser-results.json`,
    JSON.stringify({ results, errors }, null, 2),
  );
  await context.close();
  await browser.close();
  server.close();
}
