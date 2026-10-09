import { useState } from "react";
import { Balls, Globe, Modal, PageHead } from "./components";
import { Countdown } from "./pages";
import {
  checkPurchase,
  eth,
  expandLines,
  quickPick,
  ticketValue,
  type Game,
  type Line,
  type Pick,
  type Round,
  type TxState,
} from "./core";
import {
  basketCount,
  basketKey,
  calendarEvent,
  cents,
  demoQuote,
  generateDistinct,
  localTime,
  planBudget,
  setBasketLines,
  usd,
  type Baskets,
} from "./budget";
import { demoRounds, fixture, type DemoTicket } from "./fixtures";

export const gameName = (g: Game) => (g === 0 ? "ETH jackpot" : "NFT jackpot");

export function RoundFacts({ round }: { round: Round }) {
  const closed = Date.now() / 1000 >= round.cutoff;
  return (
    <div className={`round-facts game-${round.game}`}>
      <div>
        <span className="fine">Prize right now</span>
        <strong>
          {round.game === 0
            ? `${eth(round.actualETH)} ETH`
            : `${round.securedNFTs} secured NFTs`}
        </strong>
        <span className="fine">
          {round.game === 0
            ? `≈ ${usd(round.actualETH)} · shared equally by every matching ticket`
            : "one winning ticket takes the whole collection"}
        </span>
      </div>
      <div>
        <span className="fine">Ticket price</span>
        <strong>{eth(round.price)} ETH</strong>
        <span className="fine">≈ {usd(round.price)} illustrative</span>
      </div>
      <div>
        <span className="fine">Entries close in</span>
        <strong>
          <Countdown cutoff={round.cutoff} />
        </strong>
        <span className="fine">
          {closed ? "Closed " : ""}
          <time dateTime={new Date(round.cutoff * 1000).toISOString()}>
            {localTime(round.cutoff)}
          </time>
        </span>
      </div>
    </div>
  );
}

export default function Play({
  initialGame,
  baskets,
  onBaskets,
  onTickets,
  limit,
  onLimit,
}: {
  initialGame: Game;
  baskets: Baskets;
  onBaskets: (b: Baskets) => void;
  onTickets: (t: DemoTicket[]) => void;
  limit: number;
  onLimit: (n: number) => void;
}) {
  const [game, setGame] = useState<Game>(initialGame);
  const round = demoRounds[game];
  const key = basketKey(game, round.id);
  const basket = baskets[key];
  const lines = basket?.lines ?? [];
  const otherGame: Game = game === 0 ? 1 : 0;
  const otherBasket = baskets[basketKey(otherGame, demoRounds[otherGame].id)];
  const setLines = (next: Line[]) =>
    onBaskets(setBasketLines(baskets, game, round.id, next));
  const [main, setMain] = useState<number[]>([]);
  const [bonus, setBonus] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [howMany, setHowMany] = useState(3);
  const [error, setError] = useState("");
  const [tx, setTx] = useState<TxState>("idle");
  const [review, setReview] = useState<Round | null>(null);
  const [demoFailure, setDemoFailure] = useState(false);
  const [receipt, setReceipt] = useState<{
    entries: Pick[];
    round: Round;
    wei: bigint;
  } | null>(null);
  const count = basketCount(basket);
  const roundClosed = Date.now() / 1000 >= round.cutoff;
  let totalWei = 0n;
  try {
    if (lines.length) totalWei = ticketValue(lines, round.price);
  } catch {
    /* validation displayed by submit */
  }
  const plan = planBudget(limit, round.price, count);
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
  function commit(next: Line[]) {
    try {
      expandLines(next);
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
    setLines(next);
    setError("");
    return true;
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
    if (!commit(next)) {
      document.getElementById("ticket-quantity")?.focus();
      return;
    }
    setMain([]);
    setBonus(null);
    setQuantity(1);
    setEditing(null);
  }
  function generate() {
    try {
      const fresh = generateDistinct(howMany, lines);
      commit([...lines, ...fresh.map((p) => ({ ...p, quantity: 1 }))]);
    } catch (e) {
      setError((e as Error).message);
    }
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
    if (demoFailure) {
      setTx("rejected");
      return;
    }
    setTx("pending");
    try {
      await fixture.buy(review, lines);
      await new Promise((resolve) => setTimeout(resolve, 650));
      const entries = expandLines(lines);
      const stamp = Date.now();
      onTickets(
        entries.map((p, i) => ({
          id: `local-${stamp}-${i + 1}`,
          game,
          round: review.id,
          pick: p,
          kind: "entry",
          amount: "Entered this demo round",
          source: "mine",
          purchasedAt: stamp,
        })),
      );
      setReceipt({ entries, round: review, wei: totalWei });
      setTx("confirmed");
      setLines([]);
    } catch (e) {
      setTx("failed");
      setError((e as Error).message);
    }
  }
  function downloadCalendar() {
    const ics = calendarEvent(
      `Sorphera demo · ${gameName(game)} round ${String(round.id)} entries close`,
      round.cutoff,
      location.href.replace(/#.*$/, "#draw"),
      `sorphera-demo-${game}-${String(round.id)}@demo`,
    );
    const url = URL.createObjectURL(
      new Blob([ics], { type: "text/calendar" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `sorphera-demo-round-${String(round.id)}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const sharing =
    game === 0
      ? "ETH prize sharing: every ticket that matches all four numbers gets an equal share of the ETH prize."
      : "One NFT winner: if several tickets match, a separate confirmed tie-break picks one ticket for the whole collection.";
  return (
    <>
      <PageHead
        eyebrow="Make your picks"
        title="Your numbers. Your world."
        description="Set a budget, choose a jackpot, pick your numbers, and let possibility do the rest."
      />
      <section className="budget-bar" aria-labelledby="budget-title">
        <div>
          <h2 id="budget-title">What does my budget buy?</h2>
          <label className="budget-input">
            Total spending limit (US$)
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              value={Number.isFinite(limit) ? limit : ""}
              onChange={(e) => onLimit(Number(e.target.value))}
              aria-describedby="budget-help"
            />
          </label>
          <p className="fine" id="budget-help">
            {demoQuote.label}: 1 ETH ≈ US$
            {demoQuote.usdPerEth.toLocaleString("en-US")}. Estimated network fee{" "}
            {eth(demoQuote.feeWei)} ETH ≈ {usd(demoQuote.feeWei)} per purchase,
            illustrative.
          </p>
        </div>
        <div className="budget-answer" role="status">
          {plan.affordable > 0 ? (
            <>
              <strong>
                {plan.affordable} whole ticket{plan.affordable === 1 ? "" : "s"}
              </strong>
              <span>
                fit in {cents(BigInt(plan.limitCents))} after the estimated fee.
                Nothing is added for you: pick each entry yourself.
              </span>
            </>
          ) : (
            <>
              <strong>Not even one ticket fits.</strong>
              <span>{plan.reason}</span>
            </>
          )}
        </div>
      </section>
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
                  setEditing(null);
                  setError("");
                }}
              >
                {gameName(g)}
                {basketCount(
                  baskets[basketKey(g, demoRounds[g].id)],
                ) > 0 && (
                  <span className="count-dot">
                    <span className="sr-only">, </span>
                    {basketCount(baskets[basketKey(g, demoRounds[g].id)])}
                    <span className="sr-only"> in basket</span>
                  </span>
                )}
              </button>
            ))}
          </div>
          <RoundFacts round={round} />
          <p className="fine">
            Closing time is when entries stop. The draw itself depends on
            settlement and confirmed randomness, so results can take longer.
          </p>
          <p className="sharing-note">{sharing}</p>
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
              Repeat these numbers
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
                aria-describedby="ticket-error repeat-help"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </label>
            <button className="button primary" onClick={add}>
              {editing === null ? "Add to basket" : "Save ticket line"}
              <span aria-hidden="true">+</span>
            </button>
          </div>
          <p className="fine" id="repeat-help">
            Repeats buy the same numbers more than once. They do not improve
            the chance those numbers are drawn; they only enlarge your share if
            they win.
          </p>
          <div className="generate-row">
            <label className="quantity">
              Generate different entries
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                value={howMany}
                onChange={(e) => setHowMany(Number(e.target.value))}
              />
            </label>
            <button className="button" onClick={generate}>
              Generate {howMany} different entries
            </button>
          </div>
          <p id="ticket-error" role="alert" className="error">
            {error}
          </p>
          <p className="fine">
            Quick Pick and Generate only choose numbers. They never add beyond
            what you ask for, purchase or sign anything.
          </p>
          <details className="odds-details">
            <summary>Odds and prize rules</summary>
            <p>
              You win only by matching all 3 main numbers and the bonus. The
              chance that one entry matches all four is 1 in 5,700. There are
              no prizes for partial matches.
            </p>
            <p>{sharing}</p>
            <p>
              Duplicate combinations are allowed. Each purchase is limited to
              100 tickets. Tickets cannot transfer and enter only this round.
            </p>
          </details>
        </section>
        <aside className="ticket-slip">
          <div className="row between">
            <h2>{gameName(game)} basket</h2>
            <span className={`pill ${game === 1 ? "pink-pill" : ""}`}>
              Round {String(round.id)}
            </span>
          </div>
          <p className="muted">
            Demo basket · {count} ticket{count === 1 ? "" : "s"}
            {otherBasket && (
              <>
                {" · "}
                <button
                  className="text-button"
                  onClick={() => setGame(otherGame)}
                >
                  {gameName(otherGame)} basket: {basketCount(otherBasket)}{" "}
                  saved
                </button>
              </>
            )}
          </p>
          {roundClosed && (
            <p className="notice">
              This round has closed. Saved drafts here cannot be entered.
            </p>
          )}
          <div className="slip-cut" />
          <div className="ticket-lines">
            {lines.length ? (
              lines.map((line, i) => (
                <div className="ticket-line" key={i}>
                  <div className="row between">
                    <span className="fine">
                      Line {i + 1} · {line.quantity}{" "}
                      {line.quantity === 1 ? "ticket" : "tickets"} ·{" "}
                      {usd(round.price * BigInt(line.quantity))}
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
                <p>Pick your numbers to add your first entry.</p>
              </div>
            )}
          </div>
          <dl className="ticket-totals">
            <div>
              <dt>Price per ticket</dt>
              <dd>
                {eth(round.price)} ETH <small>≈ {usd(round.price)}</small>
              </dd>
            </div>
            <div>
              <dt>Tickets</dt>
              <dd>{count} / 100</dd>
            </div>
            <div>
              <dt>Subtotal</dt>
              <dd>
                {eth(totalWei)} ETH <small>≈ {cents(plan.subtotalCents)}</small>
              </dd>
            </div>
            <div>
              <dt>Estimated fee</dt>
              <dd>
                {count ? eth(demoQuote.feeWei) : "0"} ETH{" "}
                <small>≈ {cents(plan.feeCents)}</small>
              </dd>
            </div>
            <div className="total">
              <dt>All-in demo total</dt>
              <dd>
                {eth(plan.allInWei)} ETH <small>≈ {cents(plan.allInCents)}</small>
              </dd>
            </div>
            <div className={plan.overBudget ? "over" : ""}>
              <dt>Remaining budget</dt>
              <dd>{cents(plan.remainingCents)}</dd>
            </div>
          </dl>
          {plan.overBudget && (
            <p className="notice" role="status">
              This basket is over your {cents(BigInt(plan.limitCents))} limit.
              Remove a line or raise the limit before reviewing.
            </p>
          )}
          <button
            className="button primary full"
            onClick={openReview}
            disabled={!lines.length || roundClosed}
          >
            Review demo basket <span aria-hidden="true">↗</span>
          </button>
          <p className="fine center">
            No wallet, payment or gas required. Nothing is bought automatically.
          </p>
          <details>
            <summary>Round details & entry rules</summary>
            <p>
              Entries close {localTime(round.cutoff)}. One ticket enters only
              this game and round. Tickets cannot transfer. Duplicate
              combinations are allowed. Sales are uncapped; each purchase is
              limited to 100 tickets.
            </p>
            <p>
              90% of new sales funds this round’s FWA acquisitions; 10% is held
              as operator fees under the contract rules. Prizes and recovery
              values are not guaranteed. USD figures use the illustrative demo
              rate.
            </p>
          </details>
        </aside>
      </div>
      {review && (
        <Modal
          title={
            tx === "confirmed"
              ? "Your demo entries are in"
              : tx === "pending"
                ? "Confirming demo entries…"
                : "Review your demo basket"
          }
          onClose={() => {
            if (tx !== "pending") {
              setReview(null);
              setTx("idle");
            }
          }}
        >
          <p className="notice">Demo - no real tickets or prizes</p>
          {tx === "confirmed" && receipt ? (
            <div className="receipt">
              <div className="confirmation-mark">✓</div>
              <p className="eyebrow">
                {gameName(game)} · Round {String(receipt.round.id)}
              </p>
              <div className="receipt-balls">
                {receipt.entries.map((p, i) => (
                  <Balls pick={p} key={i} />
                ))}
              </div>
              <dl className="ticket-totals">
                <div>
                  <dt>Tickets</dt>
                  <dd>{receipt.entries.length}</dd>
                </div>
                <div>
                  <dt>Amount</dt>
                  <dd>
                    {eth(receipt.wei)} ETH <small>≈ {usd(receipt.wei)}</small>
                  </dd>
                </div>
                <div>
                  <dt>Entries close</dt>
                  <dd>
                    {localTime(receipt.round.cutoff)}
                    <br />
                    <Countdown cutoff={receipt.round.cutoff} />
                  </dd>
                </div>
              </dl>
              <p className="fine">
                Results follow once the draw is confirmed; no result time is
                promised. No transaction was signed or broadcast.
              </p>
              <div className="stack">
                <a
                  className="button primary full"
                  href={`#draw?scenario=${game === 0 ? "eth-mine" : "nft-mine"}`}
                  onClick={() => setReview(null)}
                >
                  View your draw
                </a>
                <a
                  className="button full"
                  href="#tickets"
                  onClick={() => setReview(null)}
                >
                  My tickets
                </a>
                <button className="button full" onClick={downloadCalendar}>
                  Add closing time to calendar
                </button>
              </div>
            </div>
          ) : (
            <>
              <p>
                {gameName(game)} · Round {String(review.id)} · {count} ticket
                {count === 1 ? "" : "s"}
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
                {eth(plan.allInWei)} ETH{" "}
                <small>
                  ≈ {cents(plan.allInCents)} all-in, including{" "}
                  {cents(plan.feeCents)} estimated fee
                </small>
              </p>
              <p className="fine">
                Numbers are unordered. Your tickets apply to this round only.
                This demo confirmation will not open a wallet.
              </p>
              <p role="status">
                {tx === "pending"
                  ? "Pending demo confirmation…"
                  : tx === "rejected"
                    ? "Demo approval rejected (optional failure demonstration). Your basket is saved."
                    : tx === "failed"
                      ? error
                      : ""}
              </p>
              <button className="button primary full" onClick={confirm}>
                Confirm demo entries
              </button>
              <details>
                <summary>Optional failure demonstration</summary>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={demoFailure}
                    onChange={(e) => setDemoFailure(e.target.checked)}
                  />
                  Simulate a rejected approval instead of confirming
                </label>
              </details>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
