import { useSyncExternalStore } from "react";
import { Status, type Round } from "./core";
import { localTime } from "./budget";
import {
  countdown,
  DELAY_CAVEAT,
  roundCalendar,
  roundStatus,
} from "./schedule";

let now = Math.floor(Date.now() / 1000);
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
function refresh() {
  now = Math.floor(Date.now() / 1000);
  listeners.forEach((fn) => fn());
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  if (listeners.size === 1) {
    timer = setInterval(refresh, 1000);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    refresh();
  }
  return () => {
    listeners.delete(fn);
    if (!listeners.size) {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh);
    }
  };
}
export const useNow = () =>
  useSyncExternalStore(
    subscribe,
    () => now,
    () => now,
  );
export function RoundSchedule({
  round,
  priority = false,
  calendar = false,
}: {
  round: Round;
  priority?: boolean;
  calendar?: boolean;
}) {
  const current = useNow();
  const status = roundStatus(round, current);
  function row(kind: "draw" | "sales") {
    const target = kind === "draw" ? round.earliestDraw : round.cutoff;
    const label = kind === "draw" ? "Draw window opens" : "Ticket sales close";
    const resolved =
      round.status === Status.Won ||
      round.status === Status.Rolled ||
      round.status === Status.Cancelled;
    // Known contract state outranks a skewed client clock. A cancelled round
    // never advertises a forthcoming draw, and a closed round never sells.
    const future =
      target !== undefined &&
      current < target &&
      (kind === "draw" ? !resolved : round.status === Status.Sales);
    return (
      <div className={`schedule-time schedule-${kind}`} key={kind}>
        <span>
          {target === undefined
            ? label
            : kind === "draw" && resolved
              ? "Draw-window reference time"
              : future
                ? `${label} in`
                : kind === "draw"
                  ? "Draw window opened"
                  : "Ticket sales closed"}
        </span>
        <strong>
          {target === undefined
            ? "Timing unavailable"
            : future
              ? countdown(target, current)
              : kind === "draw"
                ? status
                : "Entries closed"}
        </strong>
        {target !== undefined && (
          <time dateTime={new Date(target * 1000).toISOString()}>
            {localTime(target)}
          </time>
        )}
      </div>
    );
  }
  return (
    <div
      className={`round-schedule${priority ? " schedule-priority" : ""}`}
      data-round={`${round.game}:${round.id}`}
    >
      <div className="schedule-heading">
        <span>{round.simulated ? "Simulated schedule" : "Round schedule"}</span>
        <span className="schedule-status" role="status">
          {status}
        </span>
      </div>
      <div className="schedule-times">
        {(priority
          ? (["draw", "sales"] as const)
          : (["sales", "draw"] as const)
        ).map(row)}
      </div>
      <p className="schedule-caveat">{DELAY_CAVEAT}</p>
      {calendar && <CalendarActions round={round} />}
    </div>
  );
}
export function CalendarActions({ round }: { round: Round }) {
  function download(kind: "draw" | "sales") {
    const text = roundCalendar(round, kind, location.href);
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/calendar;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `sorphera-${round.game === 0 ? "eth" : "nft"}-${round.id}-${kind === "draw" ? "draw-window" : "sales-closing"}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="calendar-actions">
      <button
        className="text-button"
        disabled={round.earliestDraw === undefined}
        onClick={() => download("draw")}
      >
        Add draw-window opening to calendar
      </button>
      <button className="text-button" onClick={() => download("sales")}>
        Add sales-closing reminder
      </button>
    </div>
  );
}
