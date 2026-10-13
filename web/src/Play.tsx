import { useEffect, useRef, useState } from "react";
import { Balls, Globe, Modal, PageHead } from "./components";
import { RoundSchedule, useNow } from "./RoundSchedule";
import { drawLink, entriesOpen } from "./schedule";
import {
  checkPurchase,
  eth,
  expandLines,
  quickPick,
  type Game,
  type Line,
  type Pick,
  type Round,
  type TxState,
} from "./core";
import {
  basketCount,
  basketKey,
  basketRewardCount,
  reservedRewards,
  setBasketRewards,
  cents,
  demoQuote,
  generateDistinct,
  localTime,
  planBudget,
  requireAffordable,
  type BudgetPlan,
  setBasketLines,
  usd,
  type Baskets,
} from "./budget";
import { demoRound, demoRounds, fixture, type DemoTicket } from "./fixtures";
import {
  CARD,
  eligiblePrice,
  passportView,
  projectPurchase,
  recordPurchase,
  redeemReward,
  type PassportRecord,
} from "./passport";
import { PassportCard, REWARD_RULE, Stamps } from "./Passport";

export const gameName = (g: Game) => (g === 0 ? "ETH jackpot" : "NFT jackpot");

export function RoundFacts({ round }: { round: Round }) {
  return (
    <div className={`round-facts game-${round.game}`}>
      <div>
        <span className="fine">Illustrative demo prize</span>
        <strong>
          {round.game === 0
            ? `${eth(round.actualETH)} ETH`
            : `${round.securedNFTs} demo NFTs`}
        </strong>
        <span className="fine">
          {round.game === 0
            ? `≈ ${usd(round.actualETH)} · shared equally by every matching ticket`
            : "one winning ticket takes the NFT jackpot"}
        </span>
      </div>
      <div>
        <span className="fine">Ticket price</span>
        <strong>{eth(round.price)} ETH</strong>
        <span className="fine">≈ {usd(round.price)} illustrative</span>
      </div>
      <RoundSchedule round={round} />
    </div>
  );
}

export default function Play({
  initialGame,
  initialRound,
  baskets,
  onBaskets,
  onTickets,
  limit,
  onLimit,
  passport,
  onPassport,
  identity,
}: {
  initialGame: Game;
  initialRound?: bigint;
  baskets: Baskets;
  onBaskets: (b: Baskets) => void;
  onTickets: (t: DemoTicket[]) => void;
  limit: string;
  onLimit: (n: string) => void;
  passport: PassportRecord;
  onPassport: (r: PassportRecord) => void;
  identity: string;
}) {
  const [game, setGame] = useState<Game>(initialGame);
  const round =
    game === initialGame && initialRound !== undefined
      ? (demoRound(game, initialRound) ?? demoRounds[game])
      : demoRounds[game];
  const key = basketKey(game, round.id);
  const basket = baskets[key];
  const lines = basket?.lines ?? [];
  const rewards = basket?.rewards ?? [];
  const setRewards = (next: Line[]) =>
    onBaskets(setBasketRewards(baskets, game, round.id, next));
  const [rewardMode, setRewardMode] = useState(false);
  const purchaseId = useRef("");
  const otherGame: Game = game === 0 ? 1 : 0;
  const otherBasket = baskets[basketKey(otherGame, demoRounds[otherGame].id)];
  const setLines = (next: Line[]) =>
    onBaskets(setBasketLines(baskets, game, round.id, next));
  const [main, setMain] = useState<number[]>([]);
  const [bonus, setBonus] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [requestedCount, setHowMany] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [tx, setTx] = useState<TxState>("idle");
  const [review, setReview] = useState<Round | null>(null);
  const [demoFailure, setDemoFailure] = useState(false);
  const [receipt, setReceipt] = useState<{
    entries: Pick[];
    rewardEntries: Pick[];
    round: Round;
    plan: BudgetPlan;
    before: PassportRecord;
  } | null>(null);
  const count = basketCount(basket);
  const rewardCount = basketRewardCount(basket);
  const now = useNow();
  const roundClosed = !entriesOpen(round, now);
  const plan = planBudget(
    limit,
    round.price,
    count,
    undefined,
    undefined,
    rewardCount,
  );
  const passportNow = passportView(passport);
  const reserved = reservedRewards(baskets);
  const usableRewards = Math.max(0, passportNow.available - reserved);
  const eligibleRound = eligiblePrice(round.price);
  const projected = projectPurchase(passport, count, round.price);
  const room = Math.max(0, plan.affordable - count);
  const howMany = requestedCount ?? room;
  const submitting = useRef(false);
  const mounted = useRef(true);
  const latest = useRef({ game, round, lines, rewards, limit, passport });
  latest.current = { game, round, lines, rewards, limit, passport };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function budgetField(id: string, disabled = false) {
    return (
      <div className="budget-input">
        <label htmlFor={id}>Budget for this purchase (US$)</label>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          maxLength={18}
          value={limit}
          onChange={(e) => onLimit(e.target.value)}
          disabled={disabled}
          aria-invalid={!plan.valid}
          aria-describedby={`${id}-help`}
        />
        <span id={`${id}-help`} className="fine">
          {plan.valid
            ? "Applies to this checkout. Your other basket stays separate."
            : plan.reason}
        </span>
      </div>
    );
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
  function commit(next: Line[]) {
    try {
      expandLines([...next, ...rewards]);
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
    if (rewardMode && editing === null) {
      if (usableRewards < 1) {
        setError("No free ticket is available to use right now.");
        return;
      }
      if (!eligibleRound) {
        setError(
          "Reward tickets can only enter rounds at the standard ticket price.",
        );
        return;
      }
      const rewardLine: Line = {
        main: main as [number, number, number],
        bonus,
        quantity: 1,
      };
      try {
        expandLines([...lines, ...rewards, rewardLine]);
      } catch (e) {
        setError((e as Error).message);
        return;
      }
      setRewards([...rewards, rewardLine]);
      setRewardMode(false);
      setMain([]);
      setBonus(null);
      setError("");
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
    if (room === 0 || !plan.valid) return;
    try {
      const fresh = generateDistinct(howMany, lines);
      commit([...lines, ...fresh.map((p) => ({ ...p, quantity: 1 }))]);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const planFor = (budget: string, price: bigint) =>
    planBudget(budget, price, count, undefined, undefined, rewardCount);
  function requireRewards(price: bigint) {
    if (!rewardCount) return;
    if (!eligiblePrice(price))
      throw new Error(
        "Reward tickets can only enter rounds at the standard ticket price.",
      );
    const available =
      passportView(latest.current.passport).available -
      (reserved - rewardCount);
    if (available < rewardCount)
      throw new Error(
        "A free ticket in this basket is no longer available. Remove it and review again.",
      );
  }
  async function openReview() {
    if (submitting.current) return;
    try {
      requireAffordable(planFor(limit, round.price));
      requireRewards(round.price);
      const fresh = await fixture.round(game, round.id);
      const current = latest.current;
      if (
        !mounted.current ||
        current.game !== game ||
        current.lines !== lines ||
        current.rewards !== rewards
      )
        throw new Error("Your basket changed. Review it again.");
      requireAffordable(planFor(current.limit, fresh.price));
      requireRewards(fresh.price);
      checkPurchase(
        fresh,
        round,
        [...lines, ...rewards],
        Math.floor(Date.now() / 1000),
      );
      // One purchase id per review: a retry after failure counts once.
      purchaseId.current = `${identity}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
      setReview(fresh);
      setTx("review");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function confirm() {
    if (!review || submitting.current || tx === "confirmed") return;
    // Synchronous latch also protects multiple events before React renders.
    submitting.current = true;
    try {
      const current = latest.current;
      requireAffordable(planFor(current.limit, review.price));
      requireRewards(review.price);
      checkPurchase(
        current.round,
        review,
        [...current.lines, ...current.rewards],
        Math.floor(Date.now() / 1000),
      );
      if (demoFailure) {
        setTx("rejected");
        return;
      }
      setTx("pending");
      setError("");
      await fixture.buy(review, [...lines, ...rewards]);
      await new Promise((resolve) => setTimeout(resolve, 650));
      const fresh = await fixture.round(game, round.id);
      const final = latest.current;
      if (!mounted.current) return;
      if (
        final.game !== game ||
        final.lines !== lines ||
        final.rewards !== rewards
      )
        throw new Error("Your basket changed. Review it again.");
      checkPurchase(
        fresh,
        review,
        [...final.lines, ...final.rewards],
        Math.floor(Date.now() / 1000),
      );
      const acceptedPlan = planFor(final.limit, fresh.price);
      requireAffordable(acceptedPlan);
      requireRewards(fresh.price);
      const entries = final.lines.length ? expandLines(final.lines) : [];
      const rewardEntries = final.rewards.length
        ? expandLines(final.rewards)
        : [];
      const stamp = Date.now();
      // Demo confirmation succeeded: count the paid tickets once (pending
      // until finalized) and consume each reward exactly once.
      let next = recordPurchase(final.passport, {
        id: purchaseId.current,
        game,
        round: String(review.id),
        price: String(fresh.price),
        paid: entries.length,
        state: "pending",
        at: stamp,
      });
      rewardEntries.forEach((pick, i) => {
        next = redeemReward(
          next,
          {
            id: `${purchaseId.current}-reward-${i + 1}`,
            game,
            round: String(review.id),
            pick,
            at: stamp,
          },
          fresh.price,
        );
      });
      onPassport(next);
      onTickets([
        ...entries.map((p, i) => ({
          id: `local-${stamp}-${i + 1}`,
          game,
          round: review.id,
          pick: p,
          kind: "entry" as const,
          amount: "Entered this demo round",
          source: "mine" as const,
          purchasedAt: stamp,
          schedule: {
            start: review.start,
            cutoff: review.cutoff,
            earliestDraw: review.earliestDraw,
          },
        })),
        ...rewardEntries.map((p, i) => ({
          id: `local-${stamp}-reward-${i + 1}`,
          game,
          round: review.id,
          pick: p,
          kind: "entry" as const,
          amount: "Reward ticket · free entry",
          source: "mine" as const,
          purchasedAt: stamp,
          schedule: {
            start: review.start,
            cutoff: review.cutoff,
            earliestDraw: review.earliestDraw,
          },
          reward: true,
        })),
      ]);
      setReceipt({
        entries,
        rewardEntries,
        round: review,
        plan: acceptedPlan,
        before: final.passport,
      });
      setTx("confirmed");
      onBaskets(
        setBasketRewards(
          setBasketLines(baskets, game, round.id, []),
          game,
          round.id,
          [],
        ),
      );
    } catch (e) {
      setTx("failed");
      setError((e as Error).message);
    } finally {
      submitting.current = false;
    }
  }
  const sharing =
    game === 0
      ? "ETH prize sharing: every ticket that matches all four numbers gets an equal share of the ETH prize."
      : "One NFT winner: if several tickets match, a separate confirmed tie-break picks one ticket for the NFT jackpot.";
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
          {budgetField("purchase-budget")}
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
      {Object.values(baskets).some(
        (b) => b.round !== demoRounds[b.game].id,
      ) && (
        <details className="saved-drafts">
          <summary>Saved drafts from other rounds</summary>
          <p className="fine">
            Drafts never move into another draw. Removing a draft releases its
            reserved free tickets; earned Passport rewards stay yours.
          </p>
          {Object.values(baskets)
            .filter((b) => b.round !== demoRounds[b.game].id)
            .map((b) => (
              <div className="row wrap" key={basketKey(b.game, b.round)}>
                <a
                  className="button"
                  href={`#play?game=${b.game}&round=${b.round}`}
                >
                  {gameName(b.game)} round {String(b.round)} ·{" "}
                  {basketCount(b) + basketRewardCount(b)} saved
                </a>
                <button
                  className="text-button"
                  onClick={() => {
                    const next = { ...baskets };
                    delete next[basketKey(b.game, b.round)];
                    onBaskets(next);
                  }}
                >
                  Remove draft and release rewards
                </button>
              </div>
            ))}
        </details>
      )}
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
                  setHowMany(null);
                  setEditing(null);
                  setError("");
                }}
              >
                {gameName(g)}
                {basketCount(baskets[basketKey(g, demoRounds[g].id)]) > 0 && (
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
            Simulated: the 30-minute gap is illustrative, not production policy
            or a promise of results.
          </p>
          <p className="sharing-note">{sharing}</p>
          {game === 1 && (
            <p className="fine">
              NFT jackpot prizes come from FWA pulls. Demo placeholders only; no
              NFTs have been pulled, secured or won.
            </p>
          )}
          <PassportCard
            record={passport}
            reserved={reserved}
            compact
            onUse={() => {
              setRewardMode(true);
              setEditing(null);
              setQuantity(1);
              setError("");
              document.getElementById("picker")?.focus();
            }}
          />
          {!eligibleRound && (
            <p className="notice">
              This round’s price differs from the standard ticket price, so its
              tickets earn no stamps and cannot take reward tickets.
            </p>
          )}
          {rewardMode && (
            <div className="reward-mode" role="status">
              <strong>Choosing numbers for your free ticket.</strong>
              <span>
                Pick 3 main numbers and a bonus, then add it. One reward ticket
                at a time, at no ticket price.
              </span>
              <button
                className="text-button"
                onClick={() => setRewardMode(false)}
              >
                Cancel
              </button>
            </div>
          )}
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
                value={rewardMode ? 1 : quantity}
                disabled={rewardMode}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </label>
            <button className="button primary" onClick={add}>
              {rewardMode
                ? "Add free ticket"
                : editing === null
                  ? "Add to basket"
                  : "Save ticket line"}
              <span aria-hidden="true">+</span>
            </button>
          </div>
          <p className="fine" id="repeat-help">
            Repeats buy the same numbers more than once. They do not improve the
            chance those numbers are drawn; they only enlarge your share if they
            win.
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
            <button
              className="button"
              onClick={generate}
              disabled={
                room === 0 ||
                !Number.isInteger(howMany) ||
                howMany < 1 ||
                howMany + count > 100
              }
            >
              Generate {howMany} different entries
            </button>
          </div>
          {room === 0 && (
            <p className="fine" role="status">
              {plan.affordable === 0
                ? plan.reason
                : "No additional ticket fits this purchase budget. Remove an entry or change your budget to generate more."}
            </p>
          )}
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
              chance that one entry matches all four is 1 in 5,700. There are no
              prizes for partial matches.
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
            Demo basket · {count} paid ticket{count === 1 ? "" : "s"}
            {rewardCount > 0 &&
              ` · ${rewardCount} reward ticket${rewardCount === 1 ? "" : "s"}`}
            {otherBasket && (
              <>
                {" · "}
                <button
                  className="text-button"
                  onClick={() => {
                    setGame(otherGame);
                    setHowMany(null);
                  }}
                >
                  {gameName(otherGame)} basket: {basketCount(otherBasket)} saved
                </button>
              </>
            )}
          </p>
          {roundClosed && (
            <p className="notice">
              Entries are unavailable for this round. Your saved drafts and
              unused Passport rewards are kept.
            </p>
          )}
          <div className="slip-cut" />
          <div className="ticket-lines">
            {lines.length
              ? lines.map((line, i) => (
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
              : !rewards.length && (
                  <div className="empty-ticket">
                    <Globe number="?" size="large" />
                    <h3>Every world starts somewhere.</h3>
                    <p>Pick your numbers to add your first entry.</p>
                  </div>
                )}
            {rewards.map((line, i) => (
              <div className="ticket-line reward-line" key={`r${i}`}>
                <div className="row between">
                  <span className="fine">
                    Reward ticket {i + 1} · free · US$0.00
                  </span>
                  <button
                    className="icon-button"
                    aria-label={`Remove reward ticket ${i + 1}`}
                    onClick={() =>
                      setRewards(rewards.filter((_, j) => j !== i))
                    }
                  >
                    ×
                  </button>
                </div>
                <Balls pick={line} />
              </div>
            ))}
          </div>
          {eligibleRound && (count > 0 || rewardCount > 0) && (
            <div className="basket-passport" role="status">
              <Stamps
                view={{
                  ...passportNow,
                  stamps: projected.stamps,
                  pendingStamps: 0,
                }}
              />
              <span className="fine">
                Passport now: {passportNow.stamps} of {CARD}. After this
                purchase: {projected.stamps} of {CARD}
                {projected.rewards > 0 &&
                  ` and ${projected.rewards} new free ticket${projected.rewards === 1 ? "" : "s"}`}
                . Counted once the purchase is finalized; a projected reward
                cannot be spent before it is earned.
              </span>
            </div>
          )}
          <dl className="ticket-totals">
            <div>
              <dt>Price per ticket</dt>
              <dd>
                {eth(round.price)} ETH <small>≈ {usd(round.price)}</small>
              </dd>
            </div>
            <div>
              <dt>Paid tickets</dt>
              <dd>{count} / 100</dd>
            </div>
            <div>
              <dt>Paid subtotal</dt>
              <dd>
                {eth(plan.subtotalWei)} ETH{" "}
                <small>≈ {cents(plan.subtotalCents)}</small>
              </dd>
            </div>
            {rewardCount > 0 && (
              <div>
                <dt>Reward tickets</dt>
                <dd>
                  {rewardCount} × 0 ETH <small>≈ US$0.00</small>
                </dd>
              </div>
            )}
            <div>
              <dt>Estimated network fee</dt>
              <dd>
                {count + rewardCount ? eth(demoQuote.feeWei) : "0"} ETH{" "}
                <small>≈ {cents(plan.feeCents)}</small>
              </dd>
            </div>
            <div className="total">
              <dt>All-in demo total</dt>
              <dd>
                {eth(plan.allInWei)} ETH{" "}
                <small>≈ {cents(plan.allInCents)}</small>
              </dd>
            </div>
            <div className={plan.overBudget ? "over" : ""}>
              <dt>Remaining budget</dt>
              <dd>
                {plan.valid
                  ? cents(plan.remainingCents)
                  : "Enter a valid budget"}
              </dd>
            </div>
          </dl>
          {(!plan.valid || plan.overBudget) && (
            <p className="notice" role="status">
              {plan.blockReason}
            </p>
          )}
          <button
            className="button primary full"
            onClick={openReview}
            disabled={!plan.canPurchase || roundClosed || tx === "pending"}
          >
            Review demo basket <span aria-hidden="true">↗</span>
          </button>
          <p className="fine center">
            Demo only: no wallet or payment. Nothing is bought automatically.
            Reward tickets are free, but a network fee still applies to every
            purchase.
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
                {receipt.rewardEntries.map((p, i) => (
                  <div className="row reward-line" key={`r${i}`}>
                    <Balls pick={p} />
                    <span className="pill pink-pill">Reward ticket</span>
                  </div>
                ))}
              </div>
              <dl className="ticket-totals">
                <div>
                  <dt>Paid tickets</dt>
                  <dd>{receipt.entries.length}</dd>
                </div>
                <div>
                  <dt>Reward tickets</dt>
                  <dd>{receipt.rewardEntries.length}</dd>
                </div>
                <div>
                  <dt>Illustrative all-in total</dt>
                  <dd>
                    {eth(receipt.plan.allInWei)} ETH{" "}
                    <small>≈ {cents(receipt.plan.allInCents)}</small>
                  </dd>
                </div>
                <div>
                  <dt>Illustrative fee / remaining budget</dt>
                  <dd>
                    {eth(receipt.plan.feeWei)} ETH ≈{" "}
                    {cents(receipt.plan.feeCents)} /{" "}
                    {cents(receipt.plan.remainingCents)}
                  </dd>
                </div>
              </dl>
              <RoundSchedule round={receipt.round} calendar />
              {eligiblePrice(receipt.round.price) && (
                <div className="receipt-passport">
                  <Stamps
                    view={{
                      ...passportView(receipt.before),
                      stamps:
                        projectPurchase(
                          receipt.before,
                          receipt.entries.length,
                          receipt.round.price,
                        ).rewards > 0
                          ? CARD
                          : projectPurchase(
                              receipt.before,
                              receipt.entries.length,
                              receipt.round.price,
                            ).stamps,
                      pendingStamps: 0,
                    }}
                    celebrate={
                      projectPurchase(
                        receipt.before,
                        receipt.entries.length,
                        receipt.round.price,
                      ).rewards > 0
                    }
                  />
                  <p className="fine" role="status">
                    {receipt.entries.length > 0
                      ? `${receipt.entries.length} paid ticket${receipt.entries.length === 1 ? "" : "s"} added to your passport as pending. Once finalized: ${projectPurchase(receipt.before, receipt.entries.length, receipt.round.price).stamps} of ${CARD}${projectPurchase(receipt.before, receipt.entries.length, receipt.round.price).rewards > 0 ? `, card complete: ${projectPurchase(receipt.before, receipt.entries.length, receipt.round.price).rewards} free ticket earned` : ""}.`
                      : "Free-only purchase: a redeemed reward earns no stamp."}{" "}
                    {receipt.rewardEntries.length > 0 && REWARD_RULE}
                  </p>
                </div>
              )}
              <p className="fine">
                Results follow once the draw is confirmed; no result time is
                promised. No transaction was signed or broadcast.
              </p>
              <div className="stack">
                <a
                  className="button primary full"
                  href={drawLink(receipt.round.game, receipt.round.id)}
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
              </div>
            </div>
          ) : (
            <>
              <p>
                {gameName(game)} · Round {String(review.id)} · {count} paid
                ticket{count === 1 ? "" : "s"}
                {rewardCount > 0 &&
                  ` · ${rewardCount} reward ticket${rewardCount === 1 ? "" : "s"}`}
              </p>
              <RoundSchedule
                round={{
                  ...review,
                  status: round.status,
                  salesEnabled: round.salesEnabled,
                }}
              />
              {budgetField("review-budget", tx === "pending")}
              <div className="review-lines">
                {lines.map((l, i) => (
                  <div className="row between" key={i}>
                    <Balls pick={l} />
                    <span>
                      × {l.quantity} · {usd(review.price * BigInt(l.quantity))}
                    </span>
                  </div>
                ))}
                {rewards.map((l, i) => (
                  <div className="row between reward-line" key={`r${i}`}>
                    <Balls pick={l} />
                    <span>Reward · US$0.00</span>
                  </div>
                ))}
              </div>
              <dl className="ticket-totals compact-totals">
                <div>
                  <dt>Paid subtotal</dt>
                  <dd>
                    {eth(plan.subtotalWei)} ETH{" "}
                    <small>≈ {cents(plan.subtotalCents)}</small>
                  </dd>
                </div>
                {rewardCount > 0 && (
                  <div>
                    <dt>Reward tickets</dt>
                    <dd>
                      {rewardCount} × 0 ETH <small>≈ US$0.00</small>
                    </dd>
                  </div>
                )}
                <div>
                  <dt>Estimated network fee</dt>
                  <dd>
                    {eth(plan.feeWei)} ETH{" "}
                    <small>≈ {cents(plan.feeCents)}</small>
                  </dd>
                </div>
                <div className="total">
                  <dt>All-in demo total</dt>
                  <dd>
                    {eth(plan.allInWei)} ETH{" "}
                    <small>≈ {cents(plan.allInCents)}</small>
                  </dd>
                </div>
              </dl>
              <p className="fine">
                Remaining budget:{" "}
                {plan.valid
                  ? cents(plan.remainingCents)
                  : "Enter a valid budget"}
                . {demoQuote.label}.
              </p>
              {(!plan.valid || plan.overBudget) && (
                <p className="notice" role="alert">
                  {plan.blockReason}
                </p>
              )}
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
              {roundClosed && (
                <p className="notice" role="status">
                  Entries closed or sales paused. Your draft and unused rewards
                  are saved.
                </p>
              )}
              <button
                className="button primary full"
                onClick={confirm}
                disabled={tx === "pending" || !plan.canPurchase || roundClosed}
              >
                Confirm demo entries
              </button>
              <details>
                <summary>Optional failure demonstration</summary>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    disabled={tx === "pending"}
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
