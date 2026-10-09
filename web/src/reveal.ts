import type { DrawState, Game, Pick } from "./core";

// Spoiler-safe view of a replay. Everything derived from the draw result is
// gated by how many balls have finished revealing. Timers only advance the
// reveal index; they never choose or alter the supplied result.

export const BALLS = 4; // 3 main + 1 bonus

export interface RevealView {
  /** Numbers visible so far, in reveal order; undefined = not yet shown. */
  shown: (number | undefined)[];
  complete: boolean;
  /** Customer-facing status that never leaks unrevealed facts. */
  status: string;
  /** Matches/payout/winner may be displayed only when true. */
  resultsVisible: boolean;
  /** Winner may be displayed only when true (after a tie-break, if any). */
  winnerVisible: boolean;
}

export function customerStatus(stage: string, game: Game): string {
  if (stage === "Settlement") return "Preparing the draw";
  if (stage.startsWith("Custody review")) return "Checking the prize custody";
  if (stage.startsWith("Cancelled")) return "Round cancelled · refunds only";
  if (stage === "Awaiting draw oracle") return "Waiting for confirmed numbers";
  if (stage === "Draw randomness received") return "Numbers confirmed · revealing";
  if (stage === "Matching tickets · tie-break required")
    return "Several tickets match · selecting the winning ticket";
  if (stage === "Tie-break required") return "Selecting the winning ticket";
  if (stage === "Awaiting tie-break oracle")
    return "Waiting for the confirmed winning ticket";
  if (stage === "Tie-break randomness received")
    return "Winning ticket confirmed · revealing";
  if (stage === "Winning ticket confirmed") return "Winning ticket confirmed";
  if (stage === "Result confirmed")
    return game === 0 ? "Jackpot shared" : "Jackpot won";
  if (stage.startsWith("No matches")) return "No matches · prize rolls over";
  return stage;
}

export function revealView(
  state: DrawState,
  revealed: number,
  game: Game,
): RevealView {
  const nums: number[] | undefined =
    state.main && state.bonus ? [...state.main, state.bonus] : undefined;
  const count = nums ? Math.max(0, Math.min(BALLS, revealed)) : 0;
  const shown = Array.from({ length: BALLS }, (_, i) =>
    nums && i < count ? nums[i] : undefined,
  );
  const complete = Boolean(nums) && count === BALLS;
  const resultsVisible = complete;
  const winnerVisible =
    complete && !state.provisional && Boolean(state.winningTicket);
  let status: string;
  if (nums && !complete) status = "Revealing the numbers";
  else if (nums && complete) status = customerStatus(state.stage, game);
  else status = customerStatus(state.stage, game);
  return { shown, complete, status, resultsVisible, winnerVisible };
}

export interface TicketMatch {
  mainHits: number[];
  bonusHit: boolean;
  full: boolean;
}
/** Match highlighting limited to balls already revealed. */
export function matchTicket(
  pick: Pick,
  shown: (number | undefined)[],
): TicketMatch {
  const mainShown = shown.slice(0, 3).filter((n): n is number => n !== undefined);
  const bonusShown = shown[3];
  const mainHits = pick.main.filter((n) => mainShown.includes(n));
  const bonusHit = bonusShown !== undefined && bonusShown === pick.bonus;
  const full = mainHits.length === 3 && bonusHit && mainShown.length === 3;
  return { mainHits, bonusHit, full };
}

export function paginate<T>(items: T[], page: number, size = 6) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(0, page), pages - 1);
  return { items: items.slice(p * size, (p + 1) * size), page: p, pages };
}

/** Timing per ball, in ms. Reduced motion uses a quick static reveal. */
export const timing = (reduced: boolean) =>
  reduced
    ? { spin: 0, hold: 120, travel: 0 }
    : { spin: 1500, hold: 850, travel: 450 };
