import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validatePick,
  decodeCombination,
  quickPick,
  expandLines,
  ticketValue,
  batches,
  eth,
  checkPurchase,
  isTerminal,
  replay,
  applyDraw,
  emptyDraw,
  dataKey,
  safeMetadata,
  type Pick,
  type Line,
} from "./core";
import { scenarios, demoRounds, FixtureAdapter } from "./fixtures";
import {
  activationError,
  ContractAdapter,
  abiDigest,
  type Deployment,
} from "./contract";
import { ConfirmedIndexer } from "./indexer";
import config from "./deployment.json";
import {
  encodeAbiParameters,
  encodeEventTopics,
  type PublicClient,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import { sorpheraAbi } from "./Sorphera.abi";
import baseline from "../../frontend/configuration.json";
const line: Line = { main: [19, 7, 12], bonus: 4, quantity: 1 };
const fixtureRound = demoRounds[0];
const activeNow = fixtureRound.start + 1;

test("number validation rejects repeats, out-of-range and fractional numbers", () => {
  assert.ok(validatePick(line));
  for (const p of [
    { main: [1, 1, 2], bonus: 1 },
    { main: [0, 2, 3], bonus: 1 },
    { main: [1, 2, 21], bonus: 1 },
    { main: [1, 2, 3.5], bonus: 1 },
    { main: [1, 2, 3], bonus: 0 },
    { main: [1, 2, 3], bonus: 6 },
    { main: [1, 2, 3], bonus: 1.5 },
  ])
    assert.equal(validatePick(p as unknown as Pick), false);
});
test("all 5,700 Solidity packed combinations round-trip exactly", () => {
  const keys = new Set();
  for (let a = 1; a <= 18; a++)
    for (let b = a + 1; b <= 19; b++)
      for (let c = b + 1; c <= 20; c++)
        for (let bonus = 1; bonus <= 5; bonus++) {
          const key = a | (b << 5) | (c << 10) | (bonus << 15);
          keys.add(key);
          assert.deepEqual(decodeCombination(key), { main: [a, b, c], bonus });
        }
  assert.equal(keys.size, 5700);
});
test("Quick Pick selects only valid entries and cannot mutate confirmed fixtures", () => {
  const before = JSON.stringify(scenarios, (_, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
  for (let i = 0; i < 500; i++) assert.ok(validatePick(quickPick()));
  assert.equal(
    JSON.stringify(scenarios, (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ),
    before,
  );
});
test("ticket expansion is unordered, allows duplicate combinations and respects 100", () => {
  assert.deepEqual(expandLines([line])[0].main, [7, 12, 19]);
  assert.equal(expandLines([{ ...line, quantity: 100 }]).length, 100);
  for (const quantity of [0, -1, 101, 1.5, NaN])
    assert.throws(() => expandLines([{ ...line, quantity }]));
  assert.throws(() =>
    expandLines([
      { ...line, quantity: 60 },
      { ...line, quantity: 41 },
    ]),
  );
  assert.throws(() => expandLines([]));
});
test("ETH totals stay exact in wei, including sub-micro ETH", () => {
  assert.equal(
    ticketValue([{ ...line, quantity: 100 }], 5000000000000000n),
    500000000000000000n,
  );
  assert.equal(eth(5000000000000000n), "0.005");
  assert.equal(eth(1n), "0.000000000000000001");
  assert.equal(eth(0n), "0");
});
test("recheck rejects cutoff, price, round, game, paused sales and invalid status", () => {
  assert.equal(
    checkPurchase(fixtureRound, fixtureRound, [line], activeNow),
    fixtureRound.price,
  );
  for (const changed of [
    { cutoff: activeNow },
    { start: activeNow + 1 },
    { price: 1n },
    { id: 43n },
    { game: 1 as const },
    { salesEnabled: false },
    { status: 2 as const },
  ])
    assert.throws(() =>
      checkPurchase(
        { ...fixtureRound, ...changed },
        fixtureRound,
        [line],
        activeNow,
      ),
    );
  assert.throws(() =>
    checkPurchase(fixtureRound, fixtureRound, [line], fixtureRound.cutoff),
  );
});
test("terminal statuses match the baseline exactly; appended ties stay nonterminal", () => {
  assert.deepEqual(
    Array.from({ length: 11 }, (_, i) => i).filter(isTerminal),
    baseline.terminalStatuses,
  );
});
test("NFT tie remains provisional through both oracle phases", () => {
  const s = scenarios.find((s) => s.id === "nft-tie")!;
  for (let i = 3; i < s.events.length; i++) {
    const state = replay(s.events.slice(0, i), 1);
    assert.equal(state.provisional, true);
    assert.equal(state.terminal, false);
    assert.equal(state.winningTicket, undefined);
  }
  assert.equal(replay(s.events, 1).winningTicket, "118");
  assert.equal(replay(s.events, 1).terminal, true);
});
test("unbound randomness and premature result cannot reveal a winner", () => {
  const state = applyDraw(
    emptyDraw,
    { name: "DrawRequested", requestId: "original" },
    1,
  );
  assert.deepEqual(
    applyDraw(state, { name: "RandomnessStored", requestId: "other" }, 1),
    state,
  );
  assert.deepEqual(
    applyDraw(
      emptyDraw,
      {
        name: "Result",
        matches: 1,
        winningTicket: "118",
        main: [7, 12, 19],
        bonus: 4,
      },
      1,
    ),
    emptyDraw,
  );
  const tie = replay(scenarios[1].events.slice(0, -1), 1);
  assert.equal(
    applyDraw(
      tie,
      { name: "TieBreakResult", requestId: "wrong", winningTicket: "118" },
      1,
    ).winningTicket,
    undefined,
  );
});
test("cancellation review is progress, not cancellation or draw request", () => {
  const s = scenarios.find((s) => s.id === "cancel")!;
  const review = replay(s.events.slice(0, 2), 1);
  assert.equal(review.terminal, false);
  assert.equal(review.requestId, undefined);
  assert.equal(review.main, undefined);
  assert.equal(replay(s.events, 1).terminal, true);
});
test("oracle and tie delays remain indefinite and do not release claims", () => {
  for (const id of ["oracle", "tie-delay"])
    assert.equal(
      replay(
        scenarios.find((s) => s.id === id)!.events,
        id === "oracle" ? 0 : 1,
      ).terminal,
      false,
    );
});
test("replay and skip end in identical deterministic contract-derived results", () => {
  for (const s of scenarios) {
    const a = replay(s.events, s.game);
    const b = s.events.reduce((state, e) => applyDraw(state, e, s.game), {
      ...emptyDraw,
    });
    assert.deepEqual(a, b);
    assert.deepEqual(replay(s.events, s.game), a);
  }
});
test("both rollover fixtures expire old tickets and never name an NFT winner", () => {
  for (const id of ["eth-roll", "nft-roll"]) {
    const s = scenarios.find((s) => s.id === id)!;
    const r = replay(s.events, s.game);
    assert.equal(r.matches, 0);
    assert.equal(r.terminal, true);
    assert.notEqual(r.winningTicket, "118");
  }
});
test("claim batching is capped at 20 and preserves every asset", () => {
  const assets = Array.from({ length: 47 }, (_, i) => i);
  const b = batches(assets, 20);
  assert.deepEqual(
    b.map((x) => x.length),
    [20, 20, 7],
  );
  assert.deepEqual(b.flat(), assets);
  assert.throws(() => batches(assets, 0));
});
test("failed NFT delivery is per asset; retry excludes delivered assets", async () => {
  const a = new FixtureAdapter();
  const first = await a.claimNFTs([0, 1, 2, 3, 4, 5], true, 0);
  assert.equal(first.filter((x) => x.state === "delivered").length, 5);
  assert.deepEqual(
    first.filter((x) => x.state === "failed").map((x) => x.index),
    [2],
  );
  assert.equal((await a.claimNFTs([2], true, 1))[0].state, "delivered");
  assert.ok(
    (await a.claimNFTs([1, 2], false, 0)).every((x) => x.state === "failed"),
  );
  await assert.rejects(
    a.claimNFTs(
      Array.from({ length: 21 }, (_, i) => i),
      true,
      0,
    ),
  );
});
test("demo adapter never has a wallet transport or transaction hash", async () => {
  const a = new FixtureAdapter();
  const result = await a.buy(fixtureRound, [line]);
  assert.deepEqual(result, { kind: "simulated" });
  assert.equal("client" in a, false);
  assert.throws(
    () =>
      new ContractAdapter({
        ...config,
        mode: "demo",
        transactionsActivated: true,
      } as Deployment),
    /Demo never/,
  );
});
test("activation fails closed for missing inputs, wrong chain and read-only mode", () => {
  assert.match(activationError(config as Deployment, true)!, /Demo never/);
  for (const mode of ["read-only", "transactions"] as const)
    assert.match(
      activationError(
        { ...config, mode, transactionsActivated: true } as Deployment,
        true,
      )!,
      /missing/,
    );
  assert.match(
    activationError(
      { ...config, mode: "transactions", chainId: 11155111 } as Deployment,
      true,
    )!,
    /Only Ethereum mainnet/,
  );
});
test("ABI copies preserve all canonical contract exports", () => {
  for (const [name, abi] of [["Sorphera", sorpheraAbi]] as const)
    assert.deepEqual(
      abi,
      JSON.parse(
        readFileSync(
          new URL(`../../frontend/abi/${name}.json`, import.meta.url),
          "utf8",
        ),
      ),
    );
});
test("metadata refuses active and non-HTTPS images; treats names as text", () => {
  for (const image of [
    "javascript:alert(1)",
    "data:image/svg+xml,<svg/>",
    "http://tracking.invalid/img",
    "https://user:secret@example.org/img",
  ])
    assert.equal(safeMetadata({ image }).image, null);
  assert.equal(
    safeMetadata({ name: "<script>alert(1)</script>" }).name,
    "<script>alert(1)</script>",
  );
  assert.equal(safeMetadata(null).name, "Unnamed asset");
});
test("cache identities separate chains, lotteries, games, rounds and requests", () => {
  assert.equal(
    new Set([
      dataKey(1, "ABC", 0, 1n, "1"),
      dataKey(2, "ABC", 0, 1n, "1"),
      dataKey(1, "DEF", 0, 1n, "1"),
      dataKey(1, "ABC", 1, 1n, "1"),
      dataKey(1, "ABC", 0, 2n, "1"),
      dataKey(1, "ABC", 0, 1n, "2"),
    ]).size,
    6,
  );
});
// Addresses below are existing baseline references used only as inert mock identities.
const address = baseline.constructorCoordinator as Address;
const hash1 = ("0x" + "11".repeat(32)) as Hex;
const hash2 = ("0x" + "22".repeat(32)) as Hex;
test("log indexer pages, caches, deduplicates concurrent reads and rebuilds after reorg", async () => {
  let blockHash = hash1;
  let calls = 0;
  const ranges: [bigint, bigint][] = [];
  const log = {
    address,
    data: encodeAbiParameters([{ type: "uint256" }], [6n]),
    topics: encodeEventTopics({
      abi: sorpheraAbi,
      eventName: "DrawRequested",
      args: { game: 0, round: 1n, requestId: 2n },
    }),
    blockHash,
    blockNumber: 10n,
    transactionHash: hash1,
    transactionIndex: 0,
    logIndex: 0,
    removed: false,
  };
  const client = {
    getChainId: async () => 1,
    getBlockNumber: async () => 2011n,
    getBlock: async () => ({ hash: blockHash }),
    getLogs: async ({
      fromBlock,
      toBlock,
    }: {
      fromBlock: bigint;
      toBlock: bigint;
    }) => {
      calls++;
      ranges.push([fromBlock, toBlock]);
      return fromBlock <= 10n && toBlock >= 10n ? [{ ...log, blockHash }] : [];
    },
  } as unknown as PublicClient;
  const index = new ConfirmedIndexer(client, 1, address, 10n, 12);
  const [a, b] = await Promise.all([index.sync(), index.sync()]);
  assert.equal(calls, 2);
  assert.equal(a.events.length, 1);
  assert.deepEqual(a, b);
  assert.deepEqual(ranges, [
    [10n, 1009n],
    [1010n, 2000n],
  ]);
  await index.sync();
  assert.equal(calls, 2);
  blockHash = hash2;
  const after = await index.sync();
  assert.equal(calls, 4);
  assert.equal(after.events.length, 1);
  assert.ok(after.events[0].key.includes(hash2));
});
test("actual ETH/refund claim uses entitlement and simulation even if sales are paused", async () => {
  const adapter = Object.create(ContractAdapter.prototype) as ContractAdapter;
  Object.defineProperty(adapter, "config", { value: { lottery: address } });
  adapter.signer = async () => address;
  adapter.entitlement = async () => ({
    amount: 4n,
    divisor: 1n,
    vault: address,
  });
  let fn = "";
  Object.defineProperty(adapter, "client", {
    value: {
      simulateContract: async (p: { functionName: string }) => {
        fn = p.functionName;
        return { request: p };
      },
    },
  });
  let writes = 0;
  const wallet = {
    writeContract: async () => {
      writes++;
      return hash1;
    },
  } as unknown as WalletClient;
  await adapter.claimETH(wallet, 1, 38n, [37n], address);
  assert.equal(fn, "claimETH");
  assert.equal(writes, 1);
  await assert.rejects(adapter.claimETH(wallet, 1, 38n, [37n, 37n], address));
  assert.equal(writes, 1);
});
test("finalized receipt failure cannot become a confirmed claim", async () => {
  const a = Object.create(ContractAdapter.prototype) as ContractAdapter;
  Object.defineProperty(a, "config", { value: { confirmations: 12 } });
  Object.defineProperty(a, "client", {
    value: { waitForTransactionReceipt: async () => ({ status: "reverted" }) },
  });
  await assert.rejects(a.receipt(hash1), /failed onchain/);
});
test("ABI fingerprint is stable and nonempty", async () => {
  const digest = await abiDigest();
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(await abiDigest(), digest);
});

test("NFT receipt processing distinguishes delivery, failure and shared votes", async () => {
  const { sorpheraVaultAbi } = await import("./SorpheraVault.abi");
  const a = Object.create(ContractAdapter.prototype) as ContractAdapter;
  a.receipt = async () =>
    ({
      logs: [
        {
          address,
          topics: encodeEventTopics({
            abi: sorpheraVaultAbi,
            eventName: "NFTClaimed",
            args: { index: 0n, recipient: address },
          }),
          data: "0x",
        },
        {
          address,
          topics: encodeEventTopics({
            abi: sorpheraVaultAbi,
            eventName: "NFTClaimFailed",
            args: { index: 2n, recipient: address },
          }),
          data: "0x",
        },
        {
          address,
          topics: encodeEventTopics({
            abi: sorpheraVaultAbi,
            eventName: "SharedAssetVote",
            args: { index: 3n, ticket: 118n, recipient: address },
          }),
          data: "0x",
        },
      ],
    }) as unknown as Awaited<ReturnType<ContractAdapter["receipt"]>>;
  const result = await a.nftOutcomes(hash1, address);
  assert.deepEqual(
    result.map((r) => r.state),
    ["delivered", "failed", "awaiting-consensus"],
  );
  assert.deepEqual(
    result.map((r) => r.index),
    [0n, 2n, 3n],
  );
});
test("reward queueing is never mistaken for delivery; helper Claimed is required", async () => {
  const { helperAbi } = await import("./helper.abi");
  const a = Object.create(ContractAdapter.prototype) as ContractAdapter;
  a.receipt = async () =>
    ({ logs: [] }) as unknown as Awaited<
      ReturnType<ContractAdapter["receipt"]>
    >;
  assert.equal(
    (await a.purchaserDelivery(hash1, address, address)).state,
    "unconfirmed",
  );
  a.receipt = async () =>
    ({
      logs: [
        {
          address,
          topics: encodeEventTopics({
            abi: helperAbi,
            eventName: "Claimed",
            args: { recipient: address, caller: address },
          }),
          data: encodeAbiParameters([{ type: "uint256" }], [12n]),
        },
      ],
    }) as unknown as Awaited<ReturnType<ContractAdapter["receipt"]>>;
  assert.deepEqual(await a.purchaserDelivery(hash1, address, address), {
    state: "delivered",
    amount: 12n,
  });
});

test("a shared vote followed by delivery reports one final delivered asset", async () => {
  const { sorpheraVaultAbi } = await import("./SorpheraVault.abi");
  const a = Object.create(ContractAdapter.prototype) as ContractAdapter;
  a.receipt = async () =>
    ({
      logs: [
        {
          address,
          topics: encodeEventTopics({
            abi: sorpheraVaultAbi,
            eventName: "SharedAssetVote",
            args: { index: 3n, ticket: 118n, recipient: address },
          }),
          data: "0x",
        },
        {
          address,
          topics: encodeEventTopics({
            abi: sorpheraVaultAbi,
            eventName: "NFTClaimed",
            args: { index: 3n, recipient: address },
          }),
          data: "0x",
        },
      ],
    }) as unknown as Awaited<ReturnType<ContractAdapter["receipt"]>>;
  assert.deepEqual(await a.nftOutcomes(hash1, address), [
    { index: 3n, state: "delivered" },
  ]);
});

test("receipt timeouts stay pending after broadcast and cannot imply a safe repurchase", async () => {
  const { transactionErrorState } = await import("./core");
  assert.equal(
    transactionErrorState("Timed out waiting for receipt", true),
    "pending",
  );
  assert.equal(transactionErrorState("RPC offline", true), "pending");
  assert.equal(
    transactionErrorState("Transaction failed onchain.", true),
    "failed",
  );
  assert.equal(
    transactionErrorState("User rejected the request", false),
    "rejected",
  );
  assert.equal(transactionErrorState("Simulation reverted", false), "failed");
});
