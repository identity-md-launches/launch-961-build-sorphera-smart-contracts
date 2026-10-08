import { useState } from "react";
import { Balls, Globe, Modal, PageHead } from "./components";
import {
  checkPurchase,
  eth,
  expandLines,
  quickPick,
  ticketValue,
  type Game,
  type Line,
  type Round,
  type TxState,
} from "./core";
import { demoRounds, fixture, type DemoTicket } from "./fixtures";
export default function Play({
  initialGame,
  onTickets,
}: {
  initialGame: Game;
  onTickets: (t: DemoTicket[]) => void;
}) {
  const [game, setGame] = useState<Game>(initialGame);
  const round = demoRounds[game];
  const [main, setMain] = useState<number[]>([]);
  const [bonus, setBonus] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");
  const [tx, setTx] = useState<TxState>("idle");
  const [review, setReview] = useState<Round | null>(null);
  const count = lines.reduce((sum, l) => sum + l.quantity, 0);
  let total = "0";
  try {
    if (lines.length) total = eth(ticketValue(lines, round.price));
  } catch {
    /* validation displayed by submit */
  }
  function select(n: number) {
    setError("");
    setMain((m) =>
      m.includes(n)
        ? m.filter((x) => x !== n)
        : m.length < 3
          ? [...m, n].sort((a, b) => a - b)
          : m,
    );
  }
  function pick() {
    const p = quickPick();
    setMain([...p.main]);
    setBonus(p.bonus);
    setError("");
  }
  function add() {
    if (main.length !== 3 || bonus === null) {
      setError("Choose 3 different main numbers and 1 bonus number.");
      document.getElementById("picker")?.focus();
      return;
    }
    const line: Line = {
      main: main as [number, number, number],
      bonus,
      quantity,
    };
    const next =
      editing === null
        ? [...lines, line]
        : lines.map((l, i) => (i === editing ? line : l));
    try {
      expandLines(next);
    } catch (e) {
      setError((e as Error).message);
      document.getElementById("ticket-quantity")?.focus();
      return;
    }
    setLines(next);
    setMain([]);
    setBonus(null);
    setQuantity(1);
    setEditing(null);
    setError("");
  }
  async function openReview() {
    try {
      const fresh = await fixture.round(game);
      checkPurchase(fresh, round, lines, Math.floor(Date.now() / 1000));
      setReview(fresh);
      setTx("review");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function confirm() {
    if (!review) return;
    setTx("pending");
    try {
      await fixture.buy(review, lines);
      await new Promise((resolve) => setTimeout(resolve, 650));
      onTickets(
        expandLines(lines).map((p, i) => ({
          id: `local-${Date.now()}-${i + 1}`,
          game,
          round: review.id,
          pick: p,
          kind: "entry",
          amount: "Entered this demo round",
        })),
      );
      setTx("confirmed");
      setLines([]);
    } catch (e) {
      setTx("failed");
      setError((e as Error).message);
    }
  }
  return (
    <>
      <PageHead
        eyebrow="Make your picks"
        title="Your numbers. Your world."
        description="Choose a jackpot, pick your numbers, and let possibility do the rest."
      />
      <div className="play-layout">
        <section className="picker-panel">
          <div className="game-switch" aria-label="Choose jackpot">
            {([0, 1] as Game[]).map((g) => (
              <button
                key={g}
                className={game === g ? "active" : ""}
                aria-pressed={game === g}
                onClick={() => {
                  setGame(g);
                  setError("");
                }}
              >
                {g === 0 ? "ETH jackpot" : "NFT jackpot"}
              </button>
            ))}
          </div>
          <div className="row between">
            <p className="eyebrow">01 / Pick 3 main numbers</p>
            <button className="quick-pick" onClick={pick}>
              Quick Pick <span aria-hidden="true">↗</span>
            </button>
          </div>
          <p className="muted picker-hint" id="number-help">
            From 1–20, in any order. {main.length} of 3 selected.
          </p>
          <div
            id="picker"
            tabIndex={-1}
            className="number-picker"
            role="group"
            aria-label="Main numbers, choose 3"
            aria-describedby="number-help"
          >
            {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                className={`number-choice ${main.includes(n) ? "selected" : ""}`}
                aria-label={`Main number ${n}`}
                aria-pressed={main.includes(n)}
                disabled={main.length === 3 && !main.includes(n)}
                onClick={() => select(n)}
              >
                <Globe number={n} />
              </button>
            ))}
          </div>
          <p className="eyebrow bonus-label">02 / Pick 1 bonus number</p>
          <div
            className="bonus-picker"
            role="group"
            aria-label="Bonus number, choose 1"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className={`number-choice bonus-choice ${bonus === n ? "selected" : ""}`}
                aria-label={`Bonus number ${n}`}
                aria-pressed={bonus === n}
                onClick={() => {
                  setBonus(n);
                  setError("");
                }}
              >
                <Globe number={n} kind="nft" />
              </button>
            ))}
          </div>
          <div className="picker-bottom">
            <label className="quantity">
              Copies of this entry
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                id="ticket-quantity"
                aria-invalid={
                  Boolean(error) &&
                  (!Number.isInteger(quantity) ||
                    quantity < 1 ||
                    quantity > 100)
                }
                aria-describedby="ticket-error"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </label>
            <button className="button primary" onClick={add}>
              {editing === null ? "Add ticket line" : "Save ticket line"}
              <span aria-hidden="true">+</span>
            </button>
          </div>
          <p id="ticket-error" role="alert" className="error">
            {error}
          </p>
          <p className="fine">
            Quick Pick only selects numbers. It never adds, purchases or signs a
            ticket.
          </p>
        </section>
        <aside className="ticket-slip">
          <div className="row between">
            <h2>Your ticket</h2>
            <span className={`pill ${game === 1 ? "pink-pill" : ""}`}>
              {game === 0 ? "ETH" : "NFT"}
            </span>
          </div>
          <p className="muted">
            Demo round #{String(round.id)} · game {game}
          </p>
          <div className="slip-cut" />
          <div className="ticket-lines">
            {lines.length ? (
              lines.map((line, i) => (
                <div className="ticket-line" key={i}>
                  <div className="row between">
                    <span className="fine">
                      Line {i + 1} · {line.quantity}{" "}
                      {line.quantity === 1 ? "ticket" : "tickets"}
                    </span>
                    <div className="row">
                      <button
                        className="text-button"
                        onClick={() => {
                          setMain([...line.main]);
                          setBonus(line.bonus);
                          setQuantity(line.quantity);
                          setEditing(i);
                          document.getElementById("picker")?.focus();
                        }}
                      >
                        Edit<span className="sr-only"> line {i + 1}</span>
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Remove line ${i + 1}`}
                        onClick={() => {
                          setLines(lines.filter((_, j) => j !== i));
                          setEditing(null);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <Balls pick={line} />
                </div>
              ))
            ) : (
              <div className="empty-ticket">
                <Globe number="?" size="large" />
                <h3>Every world starts somewhere.</h3>
                <p>Pick your numbers to add your first ticket line.</p>
              </div>
            )}
          </div>
          <dl className="ticket-totals">
            <div>
              <dt>Price per ticket</dt>
              <dd>{eth(round.price)} ETH</dd>
            </div>
            <div>
              <dt>Quantity</dt>
              <dd>{count} / 100</dd>
            </div>
            <div className="total">
              <dt>Demo total</dt>
              <dd>{total} ETH</dd>
            </div>
          </dl>
          <button className="button primary full" onClick={openReview}>
            Review demo tickets <span aria-hidden="true">↗</span>
          </button>
          <p className="fine center">No wallet, payment or gas required.</p>
          <details>
            <summary>Round details & entry rules</summary>
            <p>
              Cutoff: {new Date(round.cutoff * 1000).toUTCString()}. One ticket
              enters only this game and round. Tickets cannot transfer.
              Duplicate combinations are allowed. Sales are uncapped; each
              transaction is limited to 100 tickets.
            </p>
            <p>
              The 1-in-5,700 chance is for matching all numbers. Multiple ETH
              matches split the prize. Multiple NFT matches require a separate
              tie-break selecting one ticket.
            </p>
            <p>
              90% of new sales funds this round’s FWA acquisitions; 10% is held
              as operator fees under the contract rules. Prizes and recovery
              values are not guaranteed.
            </p>
          </details>
        </aside>
      </div>
      {review && (
        <Modal
          title={
            tx === "confirmed"
              ? "Demo tickets added"
              : tx === "pending"
                ? "Confirming demo entries…"
                : "Review your demo tickets"
          }
          onClose={() => {
            if (tx !== "pending") {
              setReview(null);
              setTx("idle");
            }
          }}
        >
          <p className="notice">Demo - no real tickets or prizes</p>
          {tx === "confirmed" ? (
            <>
              <div className="confirmation-mark">✓</div>
              <p>
                Your entries are in My tickets. No transaction was signed or
                broadcast.
              </p>
              <a
                className="button primary full"
                href="#tickets"
                onClick={() => setReview(null)}
              >
                View my tickets
              </a>
            </>
          ) : (
            <>
              <p>
                {game === 0 ? "ETH" : "NFT"} jackpot · game {game} · round #
                {String(review.id)}
              </p>
              <div className="review-lines">
                {lines.map((l, i) => (
                  <div className="row between" key={i}>
                    <Balls pick={l} />
                    <span>× {l.quantity}</span>
                  </div>
                ))}
              </div>
              <p className="review-total">
                {total} ETH <small>simulated total</small>
              </p>
              <p className="fine">
                Numbers are unordered. Your ticket applies to this round only.
                This demo confirmation will not open your wallet.
              </p>
              <p role="status">
                {tx === "pending"
                  ? "Pending demo confirmation…"
                  : tx === "rejected"
                    ? "Demo approval rejected. Your ticket lines are saved."
                    : tx === "failed"
                      ? error
                      : ""}
              </p>
              {tx === "review" && (
                <button
                  className="button primary full"
                  onClick={() => setTx("awaiting-approval")}
                >
                  Continue to demo approval
                </button>
              )}
              {(tx === "awaiting-approval" ||
                tx === "rejected" ||
                tx === "failed") && (
                <div className="stack">
                  <button className="button primary full" onClick={confirm}>
                    Approve demo entries
                  </button>
                  <button
                    className="button full"
                    onClick={() => setTx("rejected")}
                  >
                    Reject demo approval
                  </button>
                </div>
              )}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
