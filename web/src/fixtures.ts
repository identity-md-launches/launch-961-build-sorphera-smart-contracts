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
const week = 604800;
const now = Math.floor(Date.now() / 1000);
const cutoff = (Math.floor((now - 259200) / week) + 1) * week + 259200;
export const demoRounds: Round[] = [0, 1].map((g) => ({
  game: g as Game,
  id: 42n,
  status: Status.Sales,
  price: 5000000000000000n,
  start: cutoff + g * 3600 - week,
  cutoff: cutoff + g * 3600,
  actualETH: g === 0 ? 18420000000000000000n : 12000000000000000n,
  securedNFTs: g === 1 ? 6 : 0,
  pendingPulls: g === 1 ? 2 : 1,
  salesEnabled: true,
}));
export interface Scenario {
  id: string;
  label: string;
  game: Game;
  round: bigint;
  prize: string;
  description: string;
  events: DrawEvent[];
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
    prize: "6 secured NFTs",
    description:
      "3 matching tickets. A separate oracle request selects ticket #118 for all 6 NFTs and 0.012 ETH incidental funds.",
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
      "No matching tickets. 4 secured NFTs and residual funds roll to the next NFT round. Old tickets expire.",
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
    events: [
      ...draw(3),
      { name: "TieBreakRequired", matches: 3 },
      { name: "TieBreakRequested", requestId: "demo-delayed-tie-39" },
    ],
  },
];
export interface DemoTicket {
  id: string;
  game: Game;
  round: bigint;
  pick: Pick;
  kind: "entry" | "eth" | "nft" | "refund" | "expired" | "reward";
  amount: string;
}
export const initialTickets: DemoTicket[] = [
  {
    id: "118",
    game: 1,
    round: 41n,
    pick: { main: [7, 12, 19], bonus: 4 },
    kind: "nft",
    amount: "6 NFTs + 0.012 ETH",
  },
  {
    id: "204",
    game: 0,
    round: 41n,
    pick: { main: [7, 12, 19], bonus: 4 },
    kind: "eth",
    amount: "4.28 ETH",
  },
  {
    id: "37",
    game: 1,
    round: 38n,
    pick: { main: [3, 9, 16], bonus: 2 },
    kind: "refund",
    amount: "0.0031 ETH",
  },
  {
    id: "81",
    game: 0,
    round: 40n,
    pick: { main: [2, 8, 11], bonus: 1 },
    kind: "expired",
    amount: "No entitlement · rolled over",
  },
  {
    id: "205",
    game: 0,
    round: 41n,
    pick: { main: [7, 12, 19], bonus: 4 },
    kind: "reward",
    amount: "12 FWA purchaser tokens",
  },
];
export class FixtureAdapter {
  readonly mode = "demo" as const;
  async round(game: Game) {
    return { ...demoRounds[game] };
  }
  async buy(expected: Round, lines: Line[]) {
    checkPurchase(
      await this.round(expected.game),
      expected,
      lines,
      Math.floor(Date.now() / 1000),
    );
    return { kind: "simulated" as const };
  }
  // Receives no wallet or provider. Synthetic failure is isolated per asset.
  async claimNFTs(
    indices: number[],
    compatible: boolean,
    attempt: number,
  ): Promise<ClaimResult[]> {
    if (indices.length < 1 || indices.length > 20)
      throw new Error("Choose 1–20 assets per batch.");
    return indices.map((index) => ({
      index,
      state:
        compatible && (attempt > 0 || index !== 2) ? "delivered" : "failed",
    }));
  }
}
export const fixture = new FixtureAdapter();
