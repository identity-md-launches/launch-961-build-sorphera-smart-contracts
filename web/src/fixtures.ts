import {
  Status,
  type Round,
  type Game,
  type Pick,
  type DrawEvent,
  type ClaimResult,
  checkPurchase,
  type Line,
} from "./core";
// Frozen UTC anchors: round 42 closes Sunday 18 October 2026, independently
// at 00:00 (ETH) and 01:00 (NFT). New identities never move an old deadline.
export const DEMO_WEEK = 604800;
export const DEMO_CUTOFF = Date.UTC(2026, 9, 18) / 1000;
export function demoRound(game: Game, id: bigint): Round | undefined {
  if (id < 42n || id > 100000n) return undefined;
  const cutoff = DEMO_CUTOFF + Number(id - 42n) * DEMO_WEEK + game * 3600;
  return {
    game,
    id,
    status: Status.Sales,
    price: 5000000000000000n,
    start: cutoff - DEMO_WEEK,
    cutoff,
    earliestDraw: cutoff + 1800,
    drawDelay: 1800,
    simulated: true,
    actualETH: game === 0 ? 18420000000000000000n : 12000000000000000n,
    securedNFTs: game === 1 ? 6 : 0,
    pendingPulls: game === 1 ? 2 : 1,
    salesEnabled: true,
  };
}
function initialRound(game: Game): Round {
  let id =
    42n +
    BigInt(
      Math.max(
        0,
        Math.ceil((Date.now() / 1000 - DEMO_CUTOFF - game * 3600) / DEMO_WEEK),
      ),
    );
  try {
    const stored = localStorage.getItem(`sorphera.demo.schedule.v2:${game}`);
    if (stored && /^\d+$/.test(stored) && demoRound(game, BigInt(stored)))
      id = BigInt(stored);
    localStorage.setItem(`sorphera.demo.schedule.v2:${game}`, String(id));
  } catch {
    /* Deterministic UTC identity when storage is unavailable. */
  }
  return demoRound(game, id)!;
}
export const demoRounds: Round[] = [initialRound(0), initialRound(1)];
/** Explicit navigation only; elapsed time never reopens a stored round. */
export function selectDemoRound(game: Game, id: bigint) {
  const round = demoRound(game, id);
  if (!round) return;
  demoRounds[game] = round;
  try {
    localStorage.setItem(`sorphera.demo.schedule.v2:${game}`, String(id));
  } catch {
    /* no storage */
  }
}
export interface Scenario {
  id: string;
  label: string;
  game: Game;
  round: bigint;
  prize: string;
  description: string;
  events: DrawEvent[];
  /** Matching ticket IDs for an NFT tie finale (sample tickets). */
  finalists?: string[];
  /** Fixture replay of the customer's own open round, with simulated time. */
  simulated?: boolean;
}
const draw = (matches: number, winningTicket = "0"): DrawEvent[] => [
  { name: "DrawRequested", requestId: "demo-draw-41" },
  { name: "RandomnessStored", requestId: "demo-draw-41" },
  { name: "Result", main: [7, 12, 19], bonus: 4, matches, winningTicket },
];
export const scenarios: Scenario[] = [
  {
    id: "eth-split",
    label: "ETH · shared jackpot",
    game: 0,
    round: 41n,
    prize: "12.84 ETH",
    description:
      "3 matching tickets split 12.84 ETH equally: 4.28 ETH per ticket.",
    events: draw(3),
  },
  {
    id: "nft-tie",
    label: "NFT · the tie-break",
    game: 1,
    round: 41n,
    prize: "6 demo NFTs",
    description:
      "3 matching tickets. A separate oracle request selects ticket #118 for all 6 NFTs and 0.012 ETH incidental funds.",
    finalists: ["118", "233", "407"],
    events: [
      ...draw(3),
      { name: "TieBreakRequired", matches: 3 },
      { name: "TieBreakRequested", requestId: "demo-tie-41" },
      { name: "TieBreakRandomnessStored", requestId: "demo-tie-41" },
      {
        name: "TieBreakResult",
        requestId: "demo-tie-41",
        winningTicket: "118",
      },
    ],
  },
  {
    id: "eth-roll",
    label: "ETH · rollover",
    game: 0,
    round: 40n,
    prize: "3.60 ETH rolled",
    description:
      "No matching tickets. 3.60 ETH rolls to the next ETH round. Old tickets expire.",
    events: draw(0),
  },
  {
    id: "nft-roll",
    label: "NFT · rollover",
    game: 1,
    round: 40n,
    prize: "4 NFTs rolled",
    description:
      "No matching tickets. 4 demo NFTs and residual funds roll to the next NFT round. Old tickets expire.",
    events: draw(0),
  },
  {
    id: "cancel",
    label: "NFT · cancellation review",
    game: 1,
    round: 38n,
    prize: "0.0031 ETH / ticket",
    description:
      "No NFT secured before the deadline. The pre-request review ends in cancellation. Available refunds are 0.0031 ETH per ticket, below the 0.005 ETH cost.",
    events: [
      { name: "CancellationReviewed", cursor: 50, total: 76 },
      { name: "CancellationReviewed", cursor: 76, total: 76 },
      { name: "Cancelled" },
    ],
  },
  {
    id: "oracle",
    label: "ETH · oracle delay",
    game: 0,
    round: 39n,
    prize: "Awaiting original oracle",
    description:
      "An accepted request cannot be cancelled or replaced. There is no guaranteed refund deadline. Permanent oracle nonfulfillment can lock funds indefinitely.",
    events: [{ name: "DrawRequested", requestId: "demo-delayed-39" }],
  },
  {
    id: "tie-delay",
    label: "NFT · tie-break delay",
    game: 1,
    round: 39n,
    prize: "Winner not yet known",
    description:
      "The numbers are confirmed, but no ticket can claim this jackpot until the original tie-break request is fulfilled and finalized.",
    finalists: ["52", "77", "91"],
    events: [
      ...draw(3),
      { name: "TieBreakRequired", matches: 3 },
      { name: "TieBreakRequested", requestId: "demo-delayed-tie-39" },
    ],
  },
];
// Fixture replays of the customer's own open rounds. Outcomes are fixed and
// independent of the customer's picks: the sample tickets below match, so a
// customer entry wins only if it genuinely holds the same numbers.
export const myRoundScenarios: Scenario[] = [
  {
    id: "eth-mine",
    label: "Fixture preview · ETH round 42",
    game: 0,
    round: 42n,
    prize: "18.42 ETH",
    description:
      "Simulated time: entries closed and the draw confirmed. 2 sample tickets matched and share 18.42 ETH equally: 9.21 ETH each.",
    simulated: true,
    events: [
      { name: "DrawRequested", requestId: "demo-draw-42" },
      { name: "RandomnessStored", requestId: "demo-draw-42" },
      {
        name: "Result",
        main: [3, 11, 17],
        bonus: 2,
        matches: 2,
        winningTicket: "0",
      },
    ],
  },
  {
    id: "nft-mine",
    label: "Fixture preview · NFT round 42",
    game: 1,
    round: 42n,
    prize: "6 demo NFTs",
    description:
      "Simulated time: entries closed and the draw confirmed. 2 sample tickets matched; the separate tie-break selected ticket #315 for all 6 NFTs and 0.012 ETH incidental funds.",
    simulated: true,
    finalists: ["302", "315"],
    events: [
      { name: "DrawRequested", requestId: "demo-draw-42n" },
      { name: "RandomnessStored", requestId: "demo-draw-42n" },
      {
        name: "Result",
        main: [5, 9, 14],
        bonus: 3,
        matches: 2,
        winningTicket: "0",
      },
      { name: "TieBreakRequired", matches: 2 },
      { name: "TieBreakRequested", requestId: "demo-tie-42n" },
      { name: "TieBreakRandomnessStored", requestId: "demo-tie-42n" },
      {
        name: "TieBreakResult",
        requestId: "demo-tie-42n",
        winningTicket: "315",
      },
    ],
  },
];
export const allScenarios = [...scenarios, ...myRoundScenarios];
export interface DemoTicket {
  id: string;
  game: Game;
  round: bigint;
  pick: Pick;
  kind: "entry" | "eth" | "nft" | "refund" | "expired" | "reward";
  amount: string;
  /** Labelled sample data versus the customer's own demo entries. */
  source: "sample" | "mine";
  /** Set when the customer purchased: wei paid for the whole basket. */
  purchasedAt?: number;
  /** Passport reward ticket: a free promotional entry into the same funded draw. */
  reward?: boolean;
  /** Frozen at confirmation; absent on legacy records rather than guessed. */
  schedule?: { cutoff: number; earliestDraw?: number; start: number };
}
export const initialTickets: DemoTicket[] = [
  {
    id: "118",
    game: 1,
    round: 41n,
    pick: { main: [7, 12, 19], bonus: 4 },
    kind: "nft",
    amount: "6 NFTs + 0.012 ETH",
    source: "sample",
  },
  {
    id: "204",
    game: 0,
    round: 41n,
    pick: { main: [7, 12, 19], bonus: 4 },
    kind: "eth",
    amount: "4.28 ETH",
    source: "sample",
  },
  {
    id: "37",
    game: 1,
    round: 38n,
    pick: { main: [3, 9, 16], bonus: 2 },
    kind: "refund",
    amount: "0.0031 ETH",
    source: "sample",
  },
  {
    id: "81",
    game: 0,
    round: 40n,
    pick: { main: [2, 8, 11], bonus: 1 },
    kind: "expired",
    amount: "No entitlement · rolled over",
    source: "sample",
  },
  {
    id: "205",
    game: 0,
    round: 41n,
    pick: { main: [7, 12, 19], bonus: 4 },
    kind: "reward",
    amount: "12 FWA purchaser tokens",
    source: "sample",
  },
];
export class FixtureAdapter {
  readonly mode = "demo" as const;
  async round(game: Game, id = demoRounds[game].id) {
    const round =
      id === demoRounds[game].id ? demoRounds[game] : demoRound(game, id);
    if (!round) throw new Error("Round unavailable.");
    return { ...round };
  }
  async buy(expected: Round, lines: Line[]) {
    checkPurchase(
      await this.round(expected.game, expected.id),
      expected,
      lines,
      Math.floor(Date.now() / 1000),
    );
    return { kind: "simulated" as const };
  }
  // Receives no wallet or provider. Synthetic failure is isolated per asset.
  // The default claim succeeds; `faulty` opts into the demo failure scenario
  // where one asset fails on the first attempt and succeeds on retry.
  async claimNFTs(
    indices: number[],
    compatible: boolean,
    attempt: number,
    faulty = false,
  ): Promise<ClaimResult[]> {
    if (indices.length < 1 || indices.length > 20)
      throw new Error("Choose 1–20 assets per batch.");
    return indices.map((index) => ({
      index,
      state:
        compatible && (!faulty || attempt > 0 || index !== 2)
          ? "delivered"
          : "failed",
    }));
  }
}
export const fixture = new FixtureAdapter();
