import { useState } from "react";
import { Balls, Globe, Modal, PageHead } from "./components";
import { fixture, type DemoTicket } from "./fixtures";
import type { ClaimResult } from "./core";
import { gameName } from "./Play";
import { RoundSchedule } from "./RoundSchedule";
import { drawLink } from "./schedule";
import { demoRound } from "./fixtures";
import {
  CARD,
  eligiblePrice,
  passportView,
  setPurchaseState,
  type PassportRecord,
} from "./passport";
import { PassportCard, REWARD_RULE } from "./Passport";
export interface ClaimMemory {
  results: Record<string, ClaimResult[]>;
  claimed: string[];
  queued: string[];
}
const kindLabel = (t: DemoTicket) =>
  t.kind === "entry"
    ? t.reward
      ? "Reward ticket"
      : "Entered"
    : t.kind === "expired"
      ? "Expired"
      : t.kind === "refund"
        ? "Refund available"
        : t.kind === "reward"
          ? "Purchaser reward"
          : "Winning ticket";
export default function Tickets({
  tickets,
  memory,
  onMemory,
  passport,
  onPassport,
  identityLabel,
}: {
  tickets: DemoTicket[];
  memory: ClaimMemory;
  onMemory: (m: ClaimMemory) => void;
  passport: PassportRecord;
  onPassport: (r: PassportRecord) => void;
  identityLabel: string;
}) {
  const [game, setGame] = useState("all");
  const [round, setRound] = useState("all");
  const [claim, setClaim] = useState<DemoTicket | null>(null);
  const { results, claimed, queued } = memory;
  const setResults = (results: ClaimMemory["results"]) =>
    onMemory({ ...memory, results });
  const setClaimed = (claimed: string[]) => onMemory({ ...memory, claimed });
  const setQueued = (queued: string[]) => onMemory({ ...memory, queued });
  const [compatible, setCompatible] = useState(true);
  const [faulty, setFaulty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const filtered = tickets.filter(
    (t) =>
      (game === "all" || String(t.game) === game) &&
      (round === "all" || String(t.round) === round),
  );
  const mine = filtered.filter((t) => t.source === "mine");
  const samples = filtered.filter((t) => t.source === "sample");
  const key = (t: DemoTicket) => `${t.game}:${t.round}:${t.id}`;
  async function submit() {
    if (!claim) return;
    setBusy(true);
    setMessage("Pending demo claim…");
    await new Promise((r) => setTimeout(r, 500));
    if (claim.kind === "nft") {
      const previous = results[key(claim)] ?? [];
      const indices = previous.length
        ? previous.filter((r) => r.state !== "delivered").map((r) => r.index)
        : [0, 1, 2, 3, 4, 5];
      const next = await fixture.claimNFTs(
        indices,
        compatible,
        attempt,
        faulty,
      );
      const merged = [
        ...previous.filter((r) => r.state === "delivered"),
        ...next,
      ].sort((a, b) => a.index - b.index);
      setResults({ ...results, [key(claim)]: merged });
      setAttempt(attempt + 1);
      setMessage(
        merged.some((r) => r.state === "failed")
          ? "Some assets could not be delivered. Successful assets stay delivered. Retry the remaining assets to a compatible recipient."
          : "Demo receipt: all 6 NFTs delivered to the sample wallet. No real assets moved.",
      );
    } else if (claim.kind === "reward") {
      setQueued([...queued, key(claim)]);
      setMessage(
        "Purchaser rewards queued. Queueing is not delivery. Check delivery separately.",
      );
    } else {
      setClaimed([...claimed, key(claim)]);
      setMessage(
        `Demo receipt: ${claim.amount} credited to the sample wallet. No real funds moved.`,
      );
    }
    setBusy(false);
  }
  const rounds = [...new Set(tickets.map((t) => String(t.round)))]
    .sort()
    .reverse();
  function card(t: DemoTicket) {
    const done = claimed.includes(key(t));
    const nftDone = results[key(t)]?.every((r) => r.state === "delivered");
    const base = demoRound(t.game, t.round);
    const open = base && t.schedule ? { ...base, ...t.schedule } : undefined;
    return (
      <article className={`my-ticket game-${t.game}`} key={key(t)}>
        <div className="ticket-identity">
          <span className="eyebrow">
            {gameName(t.game)} / Round {String(t.round)}
          </span>
          <h3>
            {t.source === "mine"
              ? t.reward
                ? "Your reward ticket"
                : "Your demo entry"
              : `Sample ticket #${t.id}`}
          </h3>
          <span className={`pill ${t.reward ? "pink-pill" : ""}`}>
            {kindLabel(t)}
          </span>
        </div>
        <Balls pick={t.pick} />
        <div className="claim-summary">
          <strong>{t.amount}</strong>
          {t.kind === "entry" &&
            (open ? (
              <RoundSchedule round={open} calendar />
            ) : (
              <p className="fine">
                Schedule unavailable for this saved ticket.
              </p>
            ))}
          {t.source === "mine" && (
            <a className="button" href={drawLink(t.game, t.round)}>
              View your draw
            </a>
          )}
          {t.reward && (
            <p className="fine">{REWARD_RULE} Same results and prize rights.</p>
          )}
          {t.kind !== "entry" && t.kind !== "expired" && (
            <button
              className="button"
              onClick={() => {
                setClaim(t);
                setMessage("");
                setAttempt(results[key(t)]?.length ? 1 : 0);
              }}
            >
              {done || nftDone
                ? "View demo receipt"
                : queued.includes(key(t))
                  ? "Check delivery"
                  : t.kind === "refund"
                    ? "Claim demo refund"
                    : "Claim demo prize"}
            </button>
          )}
        </div>
      </article>
    );
  }
  return (
    <>
      <PageHead
        eyebrow="A little collection of possibilities"
        title="My tickets"
        description="Your entries, results and claimable prizes, all in one place."
      />
      <p className="notice">
        Demo - no real tickets or prizes. Your entries, drafts and passport
        progress are demo data kept in this browser for {identityLabel}.
      </p>
      <PassportCard record={passport} />
      <details className="passport-ledger">
        <summary>Passport ledger: pending, finalized and refunded</summary>
        <p className="fine">
          One stamp per eligible paid ticket at the standard price. Free,
          refunded, cancelled or failed tickets earn nothing. Demo controls
          below simulate finality and refunds; contracts will decide the real
          rules.
        </p>
        <table className="ledger">
          <thead>
            <tr>
              <th scope="col">Purchase</th>
              <th scope="col">Paid tickets</th>
              <th scope="col">State</th>
              <th scope="col">Stamps</th>
              <th scope="col">Demo control</th>
            </tr>
          </thead>
          <tbody>
            {passport.purchases.map((p) => {
              const eligible = eligiblePrice(BigInt(p.price));
              return (
                <tr key={p.id}>
                  <td>
                    {p.sample ? "Sample · " : ""}
                    {gameName(p.game)} round {p.round}
                  </td>
                  <td>{p.paid}</td>
                  <td>{p.state}</td>
                  <td>
                    {p.state === "finalized" && eligible
                      ? p.paid
                      : p.state === "pending" && eligible
                        ? `${p.paid} pending`
                        : "0"}
                  </td>
                  <td>
                    {p.state === "pending" ? (
                      <span className="row wrap">
                        <button
                          className="text-button"
                          onClick={() =>
                            onPassport(
                              setPurchaseState(passport, p.id, "finalized"),
                            )
                          }
                        >
                          Simulate finality
                        </button>
                        <button
                          className="text-button"
                          onClick={() =>
                            onPassport(
                              setPurchaseState(passport, p.id, "refunded"),
                            )
                          }
                        >
                          Simulate refund
                        </button>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
            {passport.redemptions.map((r) => (
              <tr key={r.id}>
                <td>
                  Reward used · {gameName(r.game)} round {r.round}
                </td>
                <td>0</td>
                <td>redeemed</td>
                <td>0</td>
                <td>—</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="fine">
          Lifetime: {passportView(passport).finalized} finalized paid tickets,{" "}
          {passportView(passport).earned} rewards earned,{" "}
          {passportView(passport).used} used. Each {CARD} tickets earns one
          reward; leftover stamps carry to the next card.
        </p>
      </details>
      <div className="filters">
        <label>
          Jackpot
          <select value={game} onChange={(e) => setGame(e.target.value)}>
            <option value="all">All jackpots</option>
            <option value="0">ETH jackpot</option>
            <option value="1">NFT jackpot</option>
          </select>
        </label>
        <label>
          Round
          <select value={round} onChange={(e) => setRound(e.target.value)}>
            <option value="all">All rounds</option>
            {rounds.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <p className="muted">
          {filtered.length} ticket{filtered.length === 1 ? "" : "s"}
        </p>
      </div>
      <section aria-labelledby="mine-title" className="ticket-section">
        <div className="section-heading compact">
          <h2 id="mine-title">Your demo entries</h2>
          <span className="fine">Saved in this browser</span>
        </div>
        <div className="my-ticket-list">
          {mine.map(card)}
          {!mine.length && (
            <div className="empty-state">
              <Globe size="large" />
              <h3>No entries of yours in this view.</h3>
              {filtered.length !== tickets.length && (
                <button
                  className="button"
                  onClick={() => {
                    setGame("all");
                    setRound("all");
                  }}
                >
                  Clear filters
                </button>
              )}
              <a className="button primary" href="#play">
                Pick your first numbers
              </a>
            </div>
          )}
        </div>
      </section>
      <section aria-labelledby="samples-title" className="ticket-section">
        <div className="section-heading compact">
          <h2 id="samples-title">Sample winners, refunds and rewards</h2>
          <span className="fine">Labelled fixtures · not your entries</span>
        </div>
        <div className="my-ticket-list">{samples.map(card)}</div>
        {!samples.length && <p className="muted">No samples in this view.</p>}
      </section>
      <p className="fine">
        Valid claims remain available when sales are paused. Old tickets do not
        enter later rounds. Actual entitlements may increase after late
        recoveries.
      </p>
      {claim && (
        <Modal
          title={
            claimed.includes(key(claim)) ||
            results[key(claim)]?.every((r) => r.state === "delivered")
              ? "Demo receipt"
              : "Claim demo prize"
          }
          onClose={() => {
            if (!busy) setClaim(null);
          }}
        >
          <p className="notice">Demo - no real tickets or prizes</p>
          <p>
            {gameName(claim.game)} · Round {String(claim.round)} · Sample ticket
            #{claim.id}
          </p>
          <h3>{claim.amount}</h3>
          {claim.kind === "nft" ? (
            <>
              <ul className="asset-outcomes">
                {Array.from({ length: 6 }, (_, index) => (
                  <li key={index}>
                    <span className="nft-placeholder" aria-hidden="true">
                      NFT
                    </span>
                    <span>
                      Demo NFT {index + 1}
                      <small>Placeholder · no actual NFT</small>
                    </span>
                    <span>
                      {results[key(claim)]?.find((r) => r.index === index)
                        ?.state ?? "Ready to claim"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="fine">
                NFT jackpot prizes come from FWA pulls. These are neutral demo
                placeholders; no NFTs have been pulled, secured or won. Claims
                below simulate delivery only.
              </p>
              <button
                disabled={
                  busy ||
                  results[key(claim)]?.every((r) => r.state === "delivered")
                }
                className="button primary full"
                onClick={submit}
              >
                {busy
                  ? "Claim pending…"
                  : results[key(claim)]?.every((r) => r.state === "delivered")
                    ? "All 6 demo NFTs simulated"
                    : results[key(claim)]?.length
                      ? "Retry remaining assets"
                      : "Claim 6 demo NFTs"}
              </button>
              <p className="fine">
                Incidental ETH is separate from NFT delivery.
              </p>
              <button
                className="button full"
                disabled={claimed.includes(`${key(claim)}:eth`)}
                onClick={() => {
                  setClaimed([...claimed, `${key(claim)}:eth`]);
                  setMessage("0.012 ETH incidental funds claimed in the demo.");
                }}
              >
                {claimed.includes(`${key(claim)}:eth`)
                  ? "Incidental ETH claimed"
                  : "Claim 0.012 demo ETH"}
              </button>
              <details className="scenarios">
                <summary>Demo scenarios: failed delivery and rejection</summary>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={faulty}
                    onChange={(e) => setFaulty(e.target.checked)}
                  />
                  One asset fails on the first attempt, then succeeds on retry
                </label>
                <label>
                  Demo NFT recipient
                  <select
                    value={compatible ? "compatible" : "incompatible"}
                    onChange={(e) =>
                      setCompatible(e.target.value === "compatible")
                    }
                  >
                    <option value="compatible">
                      Demo wallet · compatible receiver
                    </option>
                    <option value="incompatible">
                      Demo contract · rejects NFT transfers
                    </option>
                  </select>
                </label>
                <p className="fine">
                  Up to 20 assets per transaction. A real contract recipient
                  must support ERC721 safe transfers. Failures are reported per
                  asset and retried without undoing successful deliveries.
                </p>
              </details>
            </>
          ) : claim.kind === "reward" && queued.includes(key(claim)) ? (
            <>
              <p>
                {claimed.includes(key(claim))
                  ? "Synthetic helper delivery confirmed."
                  : "Reward queue accepted. Delivery has not yet been confirmed."}
              </p>
              <button
                className="button primary full"
                disabled={claimed.includes(key(claim))}
                onClick={() => {
                  setClaimed([...claimed, key(claim)]);
                  setMessage(
                    "Synthetic helper Claimed event received: 12 demo FWA tokens delivered.",
                  );
                }}
              >
                Check demo delivery
              </button>
            </>
          ) : (
            <>
              <p>
                Recipient: sample wallet.{" "}
                {claim.kind === "refund"
                  ? "This refund is below the original ticket cost. Late recoveries may add entitlements."
                  : "Only the available entitlement is claimable."}
              </p>
              <button
                className="button primary full"
                disabled={busy || claimed.includes(key(claim))}
                onClick={submit}
              >
                {claimed.includes(key(claim))
                  ? "Demo claim confirmed"
                  : busy
                    ? "Claim pending…"
                    : claim.kind === "reward"
                      ? "Queue demo purchaser rewards"
                      : claim.kind === "refund"
                        ? "Claim demo refund"
                        : "Claim demo ETH"}
              </button>
            </>
          )}
          <p role="status" className="claim-message">
            {message}
          </p>
          <details>
            <summary>Verification details</summary>
            <p>
              ETH prizes and cancellation refunds use claimETH. NFT claims use
              the originating vault’s claimNFTs; a failed asset stays available
              for retry. Purchaser tokens use claimTokens and remain queued
              until the helper confirms delivery. Company rewards are excluded.
            </p>
            <p>
              Involuntary shared NFT recoveries require every entitled ticket to
              nominate the same recipient. Holdouts can delay delivery
              indefinitely. Normal NFT jackpots have one entitled winning
              ticket.
            </p>
          </details>
        </Modal>
      )}
    </>
  );
}
