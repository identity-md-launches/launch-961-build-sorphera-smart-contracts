import { Globe } from "./components";
import {
  CARD,
  passportView,
  type PassportRecord,
  type PassportView,
} from "./passport";

export const REWARD_RULE =
  "Reward tickets enter the same draw and are included in the total number of entries.";

/** Twelve globe stamps: finalized, pending (shown separately) and empty. */
export function Stamps({
  view,
  celebrate = false,
}: {
  view: PassportView;
  celebrate?: boolean;
}) {
  return (
    <ol
      className={`stamps ${celebrate ? "stamps-complete" : ""}`}
      aria-label={`${view.stamps} of ${CARD} stamps${
        view.pendingStamps ? `, ${view.pendingStamps} pending` : ""
      }`}
    >
      {Array.from({ length: CARD }, (_, i) => {
        const state =
          i < view.stamps
            ? "stamped"
            : i < view.stamps + view.pendingStamps
              ? "pending"
              : "empty";
        return (
          <li key={i} className={`stamp stamp-${state}`} aria-hidden="true">
            {state !== "empty" && <Globe size="small" />}
            <span className="stamp-index">{i + 1}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function PassportCard({
  record,
  reserved = 0,
  onUse,
  compact = false,
  celebrate = false,
  heading = "Sorphera Passport",
}: {
  record: PassportRecord;
  /** Rewards already placed in saved baskets. */
  reserved?: number;
  onUse?: () => void;
  compact?: boolean;
  celebrate?: boolean;
  heading?: string;
}) {
  const view = passportView(record);
  const usable = Math.max(0, view.available - reserved);
  return (
    <section
      className={`passport ${compact ? "passport-compact" : ""}`}
      aria-labelledby="passport-title"
    >
      <div className="row between wrap">
        <h2 id="passport-title">{heading}</h2>
        <span className="pill">Demo · simulated</span>
      </div>
      <p className="passport-rule">Every 12 paid tickets earns 1 free ticket.</p>
      <Stamps view={view} celebrate={celebrate} />
      <p className="passport-progress" role="status">
        <strong>
          {view.stamps} of {CARD} tickets
        </strong>
        <span>
          {view.remaining} more to your next free ticket
          {view.stamps === 0 && view.earned > 0 ? " (new card)" : ""}.
        </span>
      </p>
      {view.pending > 0 && (
        <p className="fine">
          {view.pending} pending ticket{view.pending === 1 ? "" : "s"} shown
          separately. Pending purchases can still be refunded, so they are not
          counted until finalized.
        </p>
      )}
      {view.available > 0 ? (
        <div className="passport-reward">
          <strong>
            {view.available} free ticket{view.available === 1 ? "" : "s"}{" "}
            available
          </strong>
          {reserved > 0 && (
            <span className="fine">
              {reserved} already in a basket. {usable} left to use.
            </span>
          )}
          {onUse ? (
            <button
              className="button primary"
              onClick={onUse}
              disabled={usable < 1}
            >
              Use free ticket
            </button>
          ) : (
            <a className="button primary" href="#play">
              Use free ticket
            </a>
          )}
        </div>
      ) : (
        !compact && (
          <p className="fine">
            Progress carries across purchases and rounds. No expiry, no weekly
            limit.
          </p>
        )
      )}
      {!compact && (
        <p className="fine">
          Demo data stored in this browser for the selected demo wallet.{" "}
          {REWARD_RULE}
        </p>
      )}
    </section>
  );
}
