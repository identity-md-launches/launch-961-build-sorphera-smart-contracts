import { useState } from "react";
import { Balls, Globe, Modal, PageHead } from "./components";
import { fixture, type DemoTicket } from "./fixtures";
import type { ClaimResult } from "./core";
export interface ClaimMemory {
  results: Record<string, ClaimResult[]>;
  claimed: string[];
  queued: string[];
}
export default function Tickets({
  tickets,
  memory,
  onMemory,
}: {
  tickets: DemoTicket[];
  memory: ClaimMemory;
  onMemory: (m: ClaimMemory) => void;
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const filtered = tickets.filter(
    (t) =>
      (game === "all" || String(t.game) === game) &&
      (round === "all" || String(t.round) === round),
  );
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
      const next = await fixture.claimNFTs(indices, compatible, attempt);
      const merged = [
        ...previous.filter((r) => r.state === "delivered"),
        ...next,
      ].sort((a, b) => a.index - b.index);
      setResults({ ...results, [key(claim)]: merged });
      setAttempt(attempt + 1);
      setMessage(
        merged.some((r) => r.state === "failed")
          ? "Some assets could not be delivered. Successful assets stay delivered. Retry the remaining assets to a compatible recipient."
          : "All 6 demo NFTs delivered.",
      );
    } else if (claim.kind === "reward") {
      setQueued([...queued, key(claim)]);
      setMessage(
        "Purchaser rewards queued. Queueing is not delivery. Check delivery separately.",
      );
    } else {
      setClaimed([...claimed, key(claim)]);
      setMessage("Demo claim confirmed. No real funds moved.");
    }
    setBusy(false);
  }
  return (
    <>
      <PageHead
        eyebrow="A little collection of possibilities"
        title="My tickets"
        description="Your entries, results and claimable prizes, all in one place."
      />
      <p className="notice">
        Sample wallet · synthetic tickets and entitlements. Local entries reset
        when you reload.
      </p>
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
            {[...new Set(tickets.map((t) => String(t.round)))]
              .sort()
              .reverse()
              .map((r) => (
                <option key={r}>{r}</option>
              ))}
          </select>
        </label>
        <p className="muted">
          {filtered.length} ticket{filtered.length === 1 ? "" : "s"}
        </p>
      </div>
      <div className="my-ticket-list">
        {filtered.map((t) => {
          const done = claimed.includes(key(t));
          const nftDone = results[key(t)]?.every(
            (r) => r.state === "delivered",
          );
          return (
            <article className={`my-ticket game-${t.game}`} key={key(t)}>
              <div className="ticket-identity">
                <span className="eyebrow">
                  {t.game === 0 ? "ETH" : "NFT"} jackpot / Round{" "}
                  {String(t.round)}
                </span>
                <h2>
                  Ticket{" "}
                  {t.id.startsWith("local") ? "· your entry" : `#${t.id}`}
                </h2>
                <span className="pill">
                  {t.kind === "entry"
                    ? "Entered"
                    : t.kind === "expired"
                      ? "Expired"
                      : t.kind === "refund"
                        ? "Refund available"
                        : t.kind === "reward"
                          ? "Purchaser reward"
                          : "Winning ticket"}
                </span>
              </div>
              <Balls pick={t.pick} />
              <div className="claim-summary">
                <strong>{t.amount}</strong>
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
                          : "Review demo claim"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {!filtered.length && (
          <div className="empty-state">
            <Globe size="large" />
            <h2>No tickets in this view.</h2>
            <button
              className="button"
              onClick={() => {
                setGame("all");
                setRound("all");
              }}
            >
              Clear filters
            </button>
            <a className="button primary" href="#play">
              Pick your first numbers
            </a>
          </div>
        )}
      </div>
      <p className="fine">
        Valid claims remain available when sales are paused. Old tickets do not
        enter later rounds. Actual entitlements may increase after late
        recoveries.
      </p>
      {claim && (
        <Modal
          title="Review demo claim"
          onClose={() => {
            if (!busy) setClaim(null);
          }}
        >
          <p className="notice">Demo - no real tickets or prizes</p>
          <p>
            {claim.game === 0 ? "ETH" : "NFT"} · Round {String(claim.round)} ·
            Ticket #{claim.id}
          </p>
          <h3>{claim.amount}</h3>
          {claim.kind === "nft" ? (
            <>
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
                Up to 20 assets per transaction. A real contract recipient must
                support ERC721 safe transfers. The fixture includes one initial
                asset failure so you can try a partial claim.
              </p>
              <ul className="asset-outcomes">
                {Array.from({ length: 6 }, (_, index) => (
                  <li key={index}>
                    <span>
                      World study {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>
                      {results[key(claim)]?.find((r) => r.index === index)
                        ?.state ?? "Ready to claim"}
                    </span>
                  </li>
                ))}
              </ul>
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
            <summary>Claim & custody details</summary>
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
