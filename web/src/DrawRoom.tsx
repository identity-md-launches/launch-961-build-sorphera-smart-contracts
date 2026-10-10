import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Balls, Globe, PageHead } from "./components";
import { allScenarios, type DemoTicket } from "./fixtures";
import { replay } from "./core";
import { BALLS, matchTicket, paginate, revealView, timing } from "./reveal";
import type { RevealPhase } from "./Chamber";
import { gameName } from "./Play";
const RevealStage = lazy(() => import("./Chamber"));

const EVENT_MS = 1100;
const ballName = (i: number) => (i === 3 ? "Bonus ball" : `Ball ${i + 1}`);

export default function DrawRoom({
  scenarioId,
  tickets,
}: {
  scenarioId?: string;
  tickets: DemoTicket[];
}) {
  const [id, setId] = useState(scenarioId ?? "eth-split");
  const scenario = allScenarios.find((s) => s.id === id) ?? allScenarios[0];
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [phase, setPhase] = useState<RevealPhase>("away");
  const [muted, setMuted] = useState(true);
  const [page, setPage] = useState(0);
  const [reduce, setReduce] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [announce, setAnnounce] = useState("");
  const state = useMemo(
    () => replay(scenario.events.slice(0, step), scenario.game),
    [scenario, step],
  );
  const clock = useRef({ key: "", elapsed: 0 });
  const [frame, setFrame] = useState({ key: "", elapsed: 0 });
  const phaseKey = `${id}:${step}:${revealed}:${phase}:${reduce}`;
  const duration =
    state.main && revealed < BALLS
      ? phase === "away"
        ? reduce
          ? 0
          : 350
        : phase === "spinning"
          ? timing(reduce).spin
          : phase === "hold"
            ? timing(reduce).hold
            : timing(reduce).travel
      : reduce
        ? 60
        : EVENT_MS;
  const progress =
    frame.key === phaseKey
      ? Math.min(1, frame.elapsed / Math.max(1, duration))
      : 0;
  const stoppedCount =
    revealed +
    (state.main && revealed < BALLS && (phase === "hold" || phase === "travel")
      ? 1
      : 0);
  const view = revealView(state, stoppedCount, scenario.game);
  const t = timing(reduce);
  const started = step > 0 || playing || frame.elapsed > 0;
  const finished =
    step >= scenario.events.length && (revealed === BALLS || !state.main);
  const spoken = useRef("");
  useEffect(() => {
    setStep(0);
    setRevealed(0);
    setPhase("away");
    setPlaying(false);
    setAnnounce("");
    setPage(0);
  }, [id]);
  useEffect(() => {
    if (scenarioId) setId(scenarioId);
  }, [scenarioId]);
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduce(m.matches);
    m.addEventListener("change", change);
    return () => m.removeEventListener("change", change);
  }, []);
  useEffect(
    () => () => {
      if ("speechSynthesis" in window) speechSynthesis.cancel();
    },
    [id],
  );
  // Timeline driver: advances fixture events and reveal phases. It only
  // sequences the supplied result; it never selects or changes numbers.
  useEffect(() => {
    if (!playing) return;
    let delay = EVENT_MS;
    let action: () => void;
    if (state.main && revealed < BALLS) {
      const current = [...state.main, state.bonus ?? 0][revealed];
      if (phase === "away") {
        delay = reduce ? 0 : 350;
        action = () => setPhase(reduce ? "hold" : "spinning");
      } else if (phase === "spinning") {
        delay = t.spin;
        action = () => setPhase("hold");
      } else if (phase === "hold") {
        delay = t.hold;
        action = () => setPhase(reduce ? "away" : "travel");
        if (spoken.current !== `${id}:${revealed}`) {
          spoken.current = `${id}:${revealed}`;
          setAnnounce(`${ballName(revealed)}: ${current}.`);
          if (!muted && "speechSynthesis" in window) {
            const u = new SpeechSynthesisUtterance(
              `${ballName(revealed)}, ${current}`,
            );
            speechSynthesis.speak(u);
          }
        }
        if (reduce) action = () => finishBall();
      } else {
        delay = t.travel;
        action = () => finishBall();
      }
    } else if (step < scenario.events.length) {
      delay = reduce ? 60 : EVENT_MS;
      action = () => setStep((v) => v + 1);
    } else {
      action = () => setPlaying(false);
      delay = 0;
    }
    function finishBall() {
      setRevealed((v) => v + 1);
      setPhase("away");
    }
    if (clock.current.key !== phaseKey)
      clock.current = { key: phaseKey, elapsed: 0 };
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      // A background tab holds the sequence rather than jumping past balls.
      const delta = document.hidden ? 0 : Math.min(50, now - last);
      last = now;
      clock.current.elapsed += delta;
      setFrame({ ...clock.current });
      if (clock.current.elapsed >= delay) action();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    playing,
    phaseKey,
    muted,
    state,
    reduce,
    t.spin,
    t.hold,
    t.travel,
    scenario.events.length,
  ]);
  useEffect(() => {
    if (view.complete && finished) setAnnounce(view.status);
  }, [view.complete, finished, view.status]);
  function start() {
    clock.current = { key: "", elapsed: 0 };
    setFrame({ key: "", elapsed: 0 });
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    setStep(0);
    setRevealed(0);
    setPhase("away");
    setAnnounce("");
    spoken.current = "";
    setPlaying(true);
    if (!muted) {
      const ctx = new AudioContext();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.025;
      o.frequency.value = 392;
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.18);
      o.onended = () => void ctx.close();
    }
  }
  function skip() {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    setStep(scenario.events.length);
    setRevealed(BALLS);
    setPhase("away");
    setPlaying(false);
  }
  const mine = tickets.filter(
    (x) => x.game === scenario.game && x.round === scenario.round,
  );
  const currentNumber =
    state.main && revealed < BALLS
      ? [...state.main, state.bonus ?? 0][revealed]
      : undefined;
  const stageKind = revealed === 3 ? "nft" : "eth";
  const finalists = scenario.finalists ?? [];
  const myFull = mine.filter((x) => matchTicket(x.pick, view.shown).full);
  const allFinalists = [
    ...finalists,
    ...myFull.filter((x) => !finalists.includes(x.id)).map((x) => x.id),
  ];
  const finale =
    scenario.game === 1 &&
    view.complete &&
    (state.provisional || view.winnerVisible) &&
    allFinalists.length > 1;
  const pageData = paginate(allFinalists, page, 6);
  return (
    <>
      <PageHead
        eyebrow="The draw room"
        title="Let the world unfold."
        description="Follow every ball, from the first turn to the final result."
      />
      <div className="draw-toolbar">
        <label>
          Explore a demo draw
          <select value={id} onChange={(e) => setId(e.target.value)}>
            {allScenarios.map((s) => (
              <option value={s.id} key={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="row wrap">
          <button
            className="quiet"
            onClick={() => {
              setMuted(!muted);
              if (!muted && "speechSynthesis" in window)
                speechSynthesis.cancel();
            }}
            aria-pressed={!muted}
          >
            {muted ? "Enable sound" : "Mute sound"}
          </button>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={reduce}
              onChange={(e) => setReduce(e.target.checked)}
            />
            Reduced motion
          </label>
        </div>
      </div>
      <div className="draw-stage">
        <div className="draw-topline">
          <span className="pill">
            {scenario.simulated
              ? "Fixture replay · simulated time"
              : "Sample replay"}
          </span>
          <span>
            {gameName(scenario.game)} · Round {String(scenario.round)}
          </span>
          <span className="draw-status" aria-hidden="true">
            {view.status}
          </span>
        </div>
        <Suspense
          fallback={
            <div className="reveal-stage chamber-fallback">
              <Globe size="large" kind={stageKind} />
              <p>Preparing the globes…</p>
            </div>
          }
        >
          <RevealStage
            ball={revealed}
            number={currentNumber}
            kind={stageKind}
            phase={phase}
            progress={progress}
            reduced={reduce}
            slotId={`slot-${revealed}`}
          />
        </Suspense>
        <div className="reveal-balls" aria-label="Drawn numbers">
          <div className="balls">
            {[0, 1, 2].map((i) => (
              <span
                id={`slot-${i}`}
                className={`slot ${i >= revealed ? "slot-empty" : ""}`}
                key={i}
                aria-label={
                  i < revealed
                    ? `Ball ${i + 1}: ${view.shown[i]}`
                    : `Ball ${i + 1}: awaiting reveal`
                }
              >
                <Globe
                  size="large"
                  number={i < revealed ? view.shown[i] : undefined}
                />
              </span>
            ))}
            <span className="bonus-plus">+</span>
            <span
              id="slot-3"
              className={`slot ${revealed < BALLS ? "slot-empty" : ""}`}
              aria-label={
                revealed === BALLS
                  ? `Bonus ball: ${view.shown[3]}`
                  : "Bonus ball: awaiting reveal"
              }
            >
              <Globe
                size="large"
                kind="nft"
                number={revealed === BALLS ? view.shown[3] : undefined}
              />
            </span>
          </div>
          <p className="muted">
            3 main balls <span className="pink">+ 1 bonus ball</span>
          </p>
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {announce}
        </p>
        <div className="draw-controls">
          <button
            className="button primary"
            onClick={
              playing
                ? () => {
                    setPlaying(false);
                    if ("speechSynthesis" in window) speechSynthesis.pause();
                  }
                : start
            }
          >
            {playing ? "Pause" : started ? "Replay" : "Watch the draw"}
            <span aria-hidden="true">▷</span>
          </button>
          {started && !playing && !finished && (
            <button
              className="button"
              onClick={() => {
                setPlaying(true);
                if ("speechSynthesis" in window) speechSynthesis.resume();
              }}
            >
              Resume
            </button>
          )}
          <button className="button" onClick={skip} disabled={finished}>
            Skip to results
          </button>
        </div>
      </div>
      {scenario.game === 1 && (
        <p className="fine">
          NFT jackpot prizes come from FWA pulls. Demo placeholders only; no
          actual NFTs have been pulled, secured or won.
        </p>
      )}
      <div className="draw-result" role="status">
        <div>
          <p className="eyebrow">
            {view.complete && state.terminal ? "Outcome" : "Draw progress"}
          </p>
          <h2>{view.status}</h2>
          <p>
            {!state.main && step === scenario.events.length
              ? scenario.description
              : view.complete && step === scenario.events.length
                ? scenario.description
                : state.main && !view.complete
                  ? "Each ball stops before its number is shown. Match counts and prizes appear only after the bonus ball."
                  : "Entries closed. Settlement and the confirmed randomness decide when the numbers arrive; results can be delayed."}
          </p>
          {view.winnerVisible && (
            <p className="winner">
              Winning ticket #{state.winningTicket} · all inventory
            </p>
          )}
          {view.complete && state.provisional && (
            <p className="fine">
              No winner is announced and no NFT claim opens until the separate
              tie-break result is confirmed.
            </p>
          )}
        </div>
        <span className="result-mark">
          {view.complete && state.terminal ? "✓" : "◌"}
        </span>
      </div>
      {finale && (
        <section className="finale" aria-labelledby="finale-title">
          <p className="eyebrow">NFT finale</p>
          <h2 id="finale-title">
            One of these matching tickets wins the whole NFT jackpot.
          </h2>
          <ul className="finalists">
            {pageData.items.map((tid) => (
              <li
                key={tid}
                className={`ticket-chip ${
                  view.winnerVisible && state.winningTicket === tid
                    ? "chip-winner"
                    : ""
                } ${mine.some((x) => x.id === tid && x.source === "mine") ? "chip-mine" : ""}`}
              >
                Ticket #{tid}
                {mine.some((x) => x.id === tid && x.source === "mine") && (
                  <small> yours</small>
                )}
              </li>
            ))}
          </ul>
          {pageData.pages > 1 && (
            <div className="row wrap">
              <button
                className="button"
                disabled={pageData.page === 0}
                onClick={() => setPage(pageData.page - 1)}
              >
                Previous
              </button>
              <span className="fine">
                Page {pageData.page + 1} of {pageData.pages}
              </span>
              <button
                className="button"
                disabled={pageData.page >= pageData.pages - 1}
                onClick={() => setPage(pageData.page + 1)}
              >
                Next
              </button>
            </div>
          )}
          {view.winnerVisible ? (
            <div className="finale-winner">
              <span className="eyebrow">Confirmed winning ticket</span>
              <strong>Ticket #{state.winningTicket}</strong>
              <span className="fine">
                Demo NFTs: {scenario.game === 1 ? 6 : 0} · incidental ETH: 0.012
                ETH, claimed separately
              </span>
            </div>
          ) : (
            <p className="fine">{view.status}…</p>
          )}
        </section>
      )}
      <section className="my-results" aria-labelledby="my-results-title">
        <h2 id="my-results-title">Your tickets in this round</h2>
        {mine.length ? (
          <ul className="result-tickets">
            {mine.map((x) => {
              const m = matchTicket(x.pick, view.shown);
              const hits = m.mainHits.length + (m.bonusHit ? 1 : 0);
              let outcome = "";
              if (view.complete) {
                if (!m.full)
                  outcome = `No win · ${hits} of 4 matched. No prizes for partial matches.`;
                else if (scenario.game === 0)
                  outcome =
                    "Matched all four · shares the ETH prize equally with other matching tickets.";
                else if (!view.winnerVisible)
                  outcome =
                    "Matched all four · waiting for the confirmed winning ticket.";
                else
                  outcome =
                    state.winningTicket === x.id
                      ? "Winning ticket · claim the demo NFT jackpot in My tickets."
                      : "Matched all four, but another ticket was selected. No prize.";
              }
              return (
                <li
                  key={x.id}
                  className={`result-ticket ${view.complete && m.full ? "full" : ""}`}
                >
                  <span className="fine">
                    {x.source === "mine"
                      ? "Your entry"
                      : `Sample ticket #${x.id}`}
                  </span>
                  <Balls
                    pick={x.pick}
                    hits={{ main: m.mainHits, bonus: m.bonusHit }}
                  />
                  <span className="outcome">
                    {outcome || `${hits} matched so far`}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">
            No tickets of yours in this round.{" "}
            <a href={`#play?game=${scenario.game}`}>Pick numbers</a> for the
            open round, then replay it here.
          </p>
        )}
        <p className="fine">
          Old tickets do not enter later rounds. ETH matches split the prize; no
          match rolls the prize into the next round of the same game.
        </p>
      </section>
      <details>
        <summary>Verification details</summary>
        <ol className="event-list">
          {scenario.events.slice(0, step).map((e, i) => (
            <li key={i}>
              {e.name}
              {e.requestId && <span> · {e.requestId}</span>}
            </li>
          ))}
        </ol>
        <p>
          These are synthetic event fixtures, not blockchain transactions. In
          live mode, confirmed DrawRequested → RandomnessStored → Result events
          determine the numbers. NFT ties require their own request, randomness
          and final result. Playback timing never chooses a winner.
        </p>
        <p>
          Accepted oracle requests cannot be replaced or cancelled. Permanent
          nonfulfillment remains an unresolved lockup risk.
        </p>
      </details>
    </>
  );
}
