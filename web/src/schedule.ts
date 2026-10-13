import { Status, type Round, type Game } from "./core";
import { calendarEvent } from "./budget";

export const DELAY_CAVEAT =
  "Numbers follow once the prize pool and draw are confirmed. Delays are possible.";
export const drawLink = (game: Game, round: bigint | string) =>
  `#draw?game=${game}&round=${round}`;
export function entriesOpen(round: Round, now: number) {
  return (
    round.salesEnabled &&
    round.status === Status.Sales &&
    now >= round.start &&
    now < round.cutoff
  );
}
export function roundStatus(round: Round, now: number): string {
  switch (round.status) {
    case Status.Won:
      return "Result confirmed";
    case Status.Rolled:
      return "Rolled over";
    case Status.Cancelled:
      return "Cancelled · available refunds only";
    case Status.TieBreakNeeded:
      return "NFT tie-break required";
    case Status.TieBreakRequested:
      return "Waiting for the NFT tie-break result";
    case Status.TieBreakReady:
      return "NFT tie-break received · awaiting finalization";
    case Status.Requested:
      return "Waiting for the draw result";
    case Status.RandomReady:
      return "Randomness received · awaiting finalization";
    case Status.None:
      return "Round not open";
  }
  if (now < round.cutoff && round.status === Status.Sales) {
    if (!round.salesEnabled) return "Sales paused";
    if (now < round.start) return "Entries not yet open";
    return "Entries open";
  }
  if (round.earliestDraw === undefined)
    return "Entries closed · draw timing unavailable";
  if (now < round.earliestDraw) return "Entries closed";
  return "Preparing the prize pool";
}
export function countdown(target: number, now: number) {
  const diff = Math.max(0, Math.ceil(target - now));
  const d = Math.floor(diff / 86400),
    h = Math.floor((diff % 86400) / 3600),
    m = Math.floor((diff % 3600) / 60);
  return `${d}d ${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m${diff < 3600 ? ` ${String(diff % 60).padStart(2, "0")}s` : ""}`;
}
export function roundCalendar(
  round: Round,
  kind: "draw" | "sales",
  baseURL: string,
) {
  const when = kind === "draw" ? round.earliestDraw : round.cutoff;
  if (when === undefined) throw new Error("Draw-window timing is unavailable.");
  const game = round.game === 0 ? "ETH" : "NFT";
  return calendarEvent(
    `Sorphera ${round.simulated ? "simulated " : ""}${game} round ${round.id} · ${kind === "draw" ? "draw window opens" : "ticket sales close"}`,
    when,
    baseURL.split("#")[0] + drawLink(round.game, round.id),
    `sorphera-${round.simulated ? "demo" : "chain"}-${round.game}-${round.id}-${kind}@sorphera`,
    `${kind === "draw" ? "Earliest draw REQUEST time; not a guaranteed result time. FWA reconciliation, randomness fulfillment and finalization must finish. NFT ties may need another request." : "Ticket sales stop at this time, even if close() has not run. This is a sales-closing reminder, not a draw appointment."} ${DELAY_CAVEAT}${round.simulated ? " Simulated schedule. The 30-minute gap is illustrative, not production policy. No real tickets or prizes." : ""}`,
  );
}
