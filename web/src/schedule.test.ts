import { customerStatus, revealView } from "./reveal";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RoundSchedule } from "./RoundSchedule";
import { replay } from "./core";
import { scenarios } from "./fixtures";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countdown,
  drawLink,
  entriesOpen,
  roundStatus,
  roundCalendar,
} from "./schedule";
import { demoRound, DEMO_CUTOFF, DEMO_WEEK } from "./fixtures";
import { Status, checkPurchase } from "./core";
import { emptyRecord, recordPurchase, passportView } from "./passport";
import { ContractAdapter } from "./contract";
import config from "./deployment.json";
import baseline from "../../frontend/configuration.json";
import type { PublicClient } from "viem";
import type { Deployment } from "./contract";
const eth = demoRound(0, 42n)!,
  nft = demoRound(1, 42n)!;

test("frozen round anchors are Sunday 00:00/01:00 UTC with independent illustrative gaps", () => {
  assert.equal(
    new Date(eth.cutoff * 1000).toISOString(),
    "2026-10-18T00:00:00.000Z",
  );
  assert.equal(nft.cutoff - eth.cutoff, 3600);
  assert.equal(eth.earliestDraw, eth.cutoff + 1800);
  assert.equal(nft.earliestDraw, nft.cutoff + 1800);
  assert.equal(eth.drawDelay, 1800);
});
test("later rounds have distinct identities; old timestamps do not depend on the clock", () => {
  assert.equal(demoRound(0, 43n)!.cutoff, DEMO_CUTOFF + DEMO_WEEK);
  assert.equal(demoRound(0, 42n)!.cutoff, DEMO_CUTOFF);
  assert.equal(demoRound(0, 41n), undefined);
  assert.equal(demoRound(1, 100001n), undefined);
});
test("strict cutoff applies to paid and reward lines while status is still Sales", () => {
  const line = { main: [1, 2, 3] as const, bonus: 1, quantity: 1 };
  assert.equal(entriesOpen(eth, eth.cutoff - 1), true);
  assert.equal(entriesOpen(eth, eth.cutoff), false);
  assert.throws(
    () => checkPurchase(eth, eth, [line], eth.cutoff),
    /not accepting/,
  );
  assert.equal(roundStatus(eth, eth.cutoff), "Entries closed");
  assert.equal(entriesOpen(nft, eth.cutoff), true);
});
test("window opens without claiming a request, a winner, or opening sales", () => {
  for (const offset of [0, 1, 86400, DEMO_WEEK]) {
    assert.equal(
      roundStatus(eth, eth.earliestDraw! + offset),
      "Preparing the prize pool",
    );
    assert.equal(entriesOpen(eth, eth.earliestDraw! + offset), false);
  }
});
test("known oracle and NFT tie states stay separate from elapsed time", () => {
  for (const [status, label] of [
    [Status.Requested, "Waiting for the draw result"],
    [Status.RandomReady, "Randomness received · awaiting finalization"],
    [Status.TieBreakNeeded, "NFT tie-break required"],
    [Status.TieBreakRequested, "Waiting for the NFT tie-break result"],
    [Status.TieBreakReady, "NFT tie-break received · awaiting finalization"],
    [Status.Won, "Result confirmed"],
    [Status.Rolled, "Rolled over"],
    [Status.Cancelled, "Cancelled · available refunds only"],
  ] as const)
    assert.equal(
      roundStatus({ ...nft, status }, nft.earliestDraw! + DEMO_WEEK),
      label,
    );
});
test("confirmed or cancelled state outranks a client clock before the reference window", () => {
  for (const status of [Status.Won, Status.Rolled, Status.Cancelled]) {
    const html = renderToStaticMarkup(
      createElement(RoundSchedule, {
        round: { ...nft, status, cutoff: 4102444800, earliestDraw: 4102446600 },
      }),
    );
    assert.doesNotMatch(html, /Draw window opens in|Ticket sales close in/);
    assert.match(html, /Draw-window reference time/);
    assert.match(html, /Entries closed/);
  }
});
test("sales pause does not move times or spend any Passport reward", () => {
  const paused = { ...eth, salesEnabled: false };
  const record = recordPurchase(emptyRecord(), {
    id: "test",
    game: 0,
    round: "42",
    price: String(eth.price),
    paid: 12,
    state: "finalized",
    at: eth.start * 1000,
  });
  const before = passportView(record);
  assert.equal(roundStatus(paused, eth.cutoff - 10), "Sales paused");
  assert.equal(entriesOpen(paused, eth.cutoff - 10), false);
  assert.deepEqual(passportView(record), before);
  assert.equal(before.available, 1);
  assert.equal(paused.earliestDraw, eth.earliestDraw);
});
test("missing earliestDraw is reported honestly", () => {
  const r = { ...eth, earliestDraw: undefined, drawDelay: undefined };
  assert.equal(
    roundStatus(r, eth.cutoff),
    "Entries closed · draw timing unavailable",
  );
  assert.throws(
    () => roundCalendar(r, "draw", "https://example.test/site/"),
    /unavailable/,
  );
});
test("countdown adds seconds only in final hour, recovers from clock jumps, never negative", () => {
  assert.equal(countdown(100000, 13600), "1d 00h 00m");
  assert.equal(countdown(100000, 96400), "0d 01h 00m");
  assert.equal(countdown(100000, 96401), "0d 00h 59m 59s");
  assert.equal(countdown(100000, 99999), "0d 00h 00m 01s");
  assert.equal(countdown(100000, 100999), "0d 00h 00m 00s");
});
test("calendar actions have separate UTC times, UIDs, labels, exact round URLs and caveat", () => {
  const draw = roundCalendar(
    nft,
    "draw",
    "https://example.test/preview/#tickets",
  ).replace(/\r\n /g, "");
  const sales = roundCalendar(
    nft,
    "sales",
    "https://example.test/preview/#tickets",
  ).replace(/\r\n /g, "");
  assert.match(draw, /DTSTART:20261018T013000Z/);
  assert.match(sales, /DTSTART:20261018T010000Z/);
  assert.match(draw, /UID:sorphera-demo-1-42-draw@/);
  assert.match(sales, /UID:sorphera-demo-1-42-sales@/);
  assert.match(
    draw,
    /URL:https:\/\/example.test\/preview\/#draw\?game=1&round=42/,
  );
  assert.match(draw, /not a guaranteed result time/);
  assert.match(sales, /not a draw appointment/);
  assert.notEqual(draw, sales);
  assert.equal(drawLink(1, 43n), "#draw?game=1&round=43");
});
test("ContractAdapter preserves the getRound timestamps without ABI changes", async () => {
  const client = {
    readContract: async ({ functionName }: { functionName: string }) => {
      if (functionName === "getRound")
        return {
          status: 1,
          group: 42n,
          price: eth.price,
          start: BigInt(eth.start),
          cutoff: BigInt(eth.cutoff),
          earliestDraw: BigInt(eth.earliestDraw!),
          settlementDeadline: BigInt(eth.earliestDraw! + 3600),
          requestedAt: 0n,
          vault: baseline.constructorCoordinator,
        };
      if (functionName === "groups") return [0n, 0n, 10n, 0n, 0n, 0n];
      if (functionName === "salesEnabled") return true;
      if (functionName === "pending") return 0n;
      throw Error(functionName);
    },
  } as unknown as PublicClient;
  const adapter = Object.create(ContractAdapter.prototype) as ContractAdapter;
  Object.assign(adapter, { config: config as Deployment, client });
  adapter.verify = async () => {};
  const r = await adapter.round(0, 42n);
  assert.equal(r.cutoff, eth.cutoff);
  assert.equal(r.earliestDraw, eth.earliestDraw);
  assert.equal(r.drawDelay, 1800);
});

test("rollover never renders ticket zero and fulfilled randomness is not a final result", () => {
  for (const scenario of scenarios.filter((s) => s.id.endsWith("-roll"))) {
    assert.equal(
      revealView(replay(scenario.events, scenario.game), 4, scenario.game)
        .winnerVisible,
      false,
    );
  }
  assert.equal(
    customerStatus("Draw randomness received", 0),
    "Randomness received · awaiting finalization",
  );
  assert.equal(
    customerStatus("Tie-break randomness received", 1),
    "Tie-break randomness received · awaiting finalization",
  );
});
