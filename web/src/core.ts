export type Game = 0 | 1;
export type Pick = { main: readonly [number, number, number]; bonus: number };
export type Line = Pick & { quantity: number };
export const Status = {
  None: 0,
  Sales: 1,
  Closed: 2,
  Requested: 3,
  RandomReady: 4,
  Won: 5,
  Rolled: 6,
  Cancelled: 7,
  TieBreakNeeded: 8,
  TieBreakRequested: 9,
  TieBreakReady: 10,
} as const;
export type StatusCode = (typeof Status)[keyof typeof Status];
export const isTerminal = (s: number) =>
  s === Status.Won || s === Status.Rolled || s === Status.Cancelled;
export const statusLabel = (s: number) =>
  ({
    0: "Not open",
    1: "Entries open",
    2: "Settling acquisitions",
    3: "Awaiting draw oracle",
    4: "Randomness received",
    5: "Won",
    6: "Rolled over",
    7: "Cancelled",
    8: "Tie-break required",
    9: "Awaiting tie-break oracle",
    10: "Tie-break ready",
  })[s] ?? "Unavailable";
export function validatePick(p: Pick): boolean {
  return (
    p.main.length === 3 &&
    new Set(p.main).size === 3 &&
    p.main.every((n) => Number.isInteger(n) && n >= 1 && n <= 20) &&
    Number.isInteger(p.bonus) &&
    p.bonus >= 1 &&
    p.bonus <= 5
  );
}
export function decodeCombination(key: number): Pick {
  const p: Pick = {
    main: [key & 31, (key >>> 5) & 31, (key >>> 10) & 31],
    bonus: (key >>> 15) & 7,
  };
  if (!validatePick(p)) throw new Error("Invalid onchain combination key.");
  return p;
}
export function expandLines(lines: Line[]): Pick[] {
  if (
    !lines.length ||
    lines.some(
      (l) =>
        !validatePick(l) ||
        !Number.isInteger(l.quantity) ||
        l.quantity < 1 ||
        l.quantity > 100,
    )
  )
    throw new Error(
      "Choose 3 distinct numbers, a bonus and a quantity from 1 to 100.",
    );
  const count = lines.reduce((n, l) => n + l.quantity, 0);
  if (count > 100)
    throw new Error("Keep each transaction to 100 tickets or fewer.");
  return lines.flatMap((l) =>
    Array.from({ length: l.quantity }, () => ({
      main: [...l.main].sort((a, b) => a - b) as [number, number, number],
      bonus: l.bonus,
    })),
  );
}
export const ticketValue = (lines: Line[], price: bigint) =>
  BigInt(expandLines(lines).length) * price;
export function secureInt(max: number) {
  const range = 0x100000000;
  const limit = range - (range % max);
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % max;
}
// Entry selection only. Never used by a result or replay renderer.
export function quickPick(): Pick {
  const nums = Array.from({ length: 20 }, (_, i) => i + 1);
  for (let i = 19; i > 0; i--) {
    const j = secureInt(i + 1);
    [nums[i], nums[j]] = [nums[j], nums[i]];
  }
  return {
    main: nums.slice(0, 3).sort((a, b) => a - b) as [number, number, number],
    bonus: secureInt(5) + 1,
  };
}
export function batches<T>(items: T[], limit: number): T[][] {
  if (!Number.isInteger(limit) || limit < 1)
    throw new Error("Invalid batch size");
  return Array.from({ length: Math.ceil(items.length / limit) }, (_, i) =>
    items.slice(i * limit, (i + 1) * limit),
  );
}
export const eth = (wei: bigint) => {
  const w = wei.toString().padStart(19, "0");
  return `${w.slice(0, -18)}.${w.slice(-18)}`.replace(/\.?0+$/, "") || "0";
};
export interface Round {
  game: Game;
  id: bigint;
  status: StatusCode;
  price: bigint;
  start: number;
  cutoff: number;
  actualETH: bigint;
  securedNFTs: number;
  pendingPulls: number;
  salesEnabled: boolean;
  cancellationReview?: { cursor: number; total: number };
}
export function checkPurchase(
  r: Round,
  expected: Round,
  lines: Line[],
  now: number,
) {
  if (r.game !== expected.game || r.id !== expected.id)
    throw new Error("The round changed. Review your entries again.");
  if (r.price !== expected.price)
    throw new Error("The ticket price changed. Review the new total.");
  if (
    !r.salesEnabled ||
    r.status !== Status.Sales ||
    now < r.start ||
    now >= r.cutoff
  )
    throw new Error("This round is not accepting entries.");
  return ticketValue(lines, r.price);
}
export type DrawEventName =
  | "CancellationReviewed"
  | "Cancelled"
  | "DrawRequested"
  | "RandomnessStored"
  | "Result"
  | "TieBreakRequired"
  | "TieBreakRequested"
  | "TieBreakRandomnessStored"
  | "TieBreakResult"
  | "Rollover";
export interface DrawEvent {
  name: DrawEventName;
  requestId?: string;
  main?: Pick["main"];
  bonus?: number;
  matches?: number;
  winningTicket?: string;
  cursor?: number;
  total?: number;
}
export interface DrawState {
  stage: string;
  main?: Pick["main"];
  bonus?: number;
  matches: number;
  winningTicket?: string;
  requestId?: string;
  tieRequestId?: string;
  terminal: boolean;
  provisional: boolean;
}
export const emptyDraw: DrawState = {
  stage: "Settlement",
  matches: 0,
  terminal: false,
  provisional: false,
};
export function applyDraw(s: DrawState, e: DrawEvent, game: Game): DrawState {
  switch (e.name) {
    case "CancellationReviewed":
      return {
        ...s,
        stage: `Custody review · ${e.cursor} of ${e.total}`,
        terminal: false,
      };
    case "Cancelled":
      return {
        ...s,
        stage: "Cancelled · available refunds only",
        terminal: true,
      };
    case "DrawRequested":
      return { ...s, stage: "Awaiting draw oracle", requestId: e.requestId };
    case "RandomnessStored":
      return e.requestId === s.requestId
        ? { ...s, stage: "Draw randomness received" }
        : s;
    case "Result": {
      if (s.stage !== "Draw randomness received") return s;
      const tie = game === 1 && (e.matches ?? 0) > 1;
      return {
        ...s,
        main: e.main,
        bonus: e.bonus,
        matches: e.matches ?? 0,
        winningTicket: tie ? undefined : e.winningTicket,
        provisional: tie,
        terminal: !tie,
        stage: tie
          ? "Matching tickets · tie-break required"
          : e.matches
            ? "Result confirmed"
            : "No matches · rolled over",
      };
    }
    case "TieBreakRequired":
      return s.provisional ? { ...s, stage: "Tie-break required" } : s;
    case "TieBreakRequested":
      return s.provisional
        ? {
            ...s,
            stage: "Awaiting tie-break oracle",
            tieRequestId: e.requestId,
          }
        : s;
    case "TieBreakRandomnessStored":
      return s.provisional && e.requestId === s.tieRequestId
        ? { ...s, stage: "Tie-break randomness received" }
        : s;
    case "TieBreakResult":
      return s.stage === "Tie-break randomness received" &&
        e.requestId === s.tieRequestId &&
        e.winningTicket &&
        e.winningTicket !== "0"
        ? {
            ...s,
            stage: "Winning ticket confirmed",
            winningTicket: e.winningTicket,
            provisional: false,
            terminal: true,
          }
        : s;
    case "Rollover":
      return { ...s, stage: "No matches · rolled over", terminal: true };
  }
}
export const replay = (events: DrawEvent[], game: Game) =>
  events.reduce((s, e) => applyDraw(s, e, game), { ...emptyDraw });
export const dataKey = (
  chain: number,
  lottery: string,
  game: Game,
  round: bigint,
  request: string,
) => `${chain}:${lottery.toLowerCase()}:${game}:${round}:${request}`;
export type TxState =
  | "idle"
  | "review"
  | "awaiting-approval"
  | "rejected"
  | "pending"
  | "confirmed"
  | "failed";
export interface ClaimResult {
  index: number;
  state: "delivered" | "failed" | "awaiting-consensus";
}
export const safeMetadata = (
  input: unknown,
): { name: string; image: string | null } => {
  const m =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  // Text is rendered by React; no HTML, data/SVG URLs, iframe, or remote script.
  let image: string | null = null;
  if (typeof m.image === "string") {
    try {
      const u = new URL(m.image);
      if (u.protocol === "https:" && !u.username && !u.password) image = u.href;
    } catch {
      /* unavailable image */
    }
  }
  return {
    name: typeof m.name === "string" ? m.name.slice(0, 120) : "Unnamed asset",
    image,
  };
};

// A broadcast hash survives transport/receipt timeouts. Only a reverted receipt
// establishes onchain failure; retrying a purchase during uncertainty can duplicate it.
export function transactionErrorState(
  message: string,
  submitted: boolean,
): TxState {
  if (submitted)
    return message === "Transaction failed onchain." ? "failed" : "pending";
  return /reject|denied|4001/i.test(message) ? "rejected" : "failed";
}
