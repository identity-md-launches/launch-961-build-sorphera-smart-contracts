import { lazy, Suspense, useEffect, useState } from "react";
import { Globe, PageHead } from "./components";
import { scenarios } from "./fixtures";
import { replay } from "./core";
const Chamber = lazy(() => import("./Chamber"));
export default function DrawRoom({ scenarioId }: { scenarioId?: string }) {
  const [id, setId] = useState(scenarioId ?? "eth-split");
  const scenario = scenarios.find((s) => s.id === id) ?? scenarios[0];
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [muted, setMuted] = useState(true);
  const [reduce, setReduce] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const state = replay(scenario.events.slice(0, step), scenario.game);
  useEffect(() => {
    setStep(0);
    setRevealed(0);
    setPlaying(false);
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
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(
      () => {
        if (state.main && revealed < 4) {
          setRevealed((v) => v + 1);
          return;
        }
        if (step < scenario.events.length) setStep((v) => v + 1);
        else setPlaying(false);
      },
      reduce ? 60 : 1100,
    );
    return () => clearTimeout(timer);
  }, [playing, step, scenario.events.length, reduce, revealed, state.main]);
  function start() {
    setStep(0);
    setRevealed(0);
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
    setStep(scenario.events.length);
    setRevealed(4);
    setPlaying(false);
  }
  return (
    <>
      <PageHead
        eyebrow="The draw room"
        title="Let the world unfold."
        description="Follow every ball, from the first reveal to the final result."
      />
      <div className="draw-toolbar">
        <label>
          Explore a demo draw
          <select value={id} onChange={(e) => setId(e.target.value)}>
            {scenarios.map((s) => (
              <option value={s.id} key={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="row wrap">
          <button
            className="quiet"
            onClick={() => setMuted(!muted)}
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
          <span className="pill">Synthetic replay</span>
          <span>
            {scenario.game === 0 ? "ETH" : "NFT"} jackpot / Round{" "}
            {String(scenario.round)}
          </span>
        </div>
        <Suspense
          fallback={
            <div className="chamber-fallback">
              <Globe size="large" />
              <p>Preparing the draw room…</p>
            </div>
          }
        >
          <Chamber active={playing} reduced={reduce} />
        </Suspense>
        <div className="reveal-balls" aria-label="Draw numbers">
          <div className="balls">
            {[0, 1, 2].map((i) => (
              <Globe
                key={i}
                size="large"
                number={state.main && revealed > i ? state.main[i] : "?"}
              />
            ))}
            <span className="bonus-plus">+</span>
            <Globe
              size="large"
              kind="nft"
              number={state.bonus && revealed > 3 ? state.bonus : "?"}
            />
          </div>
          <p className="muted">
            3 main balls <span className="pink">+ 1 bonus ball</span>
          </p>
        </div>
        <p className="sr-only" role="status">
          {state.main && revealed === 4
            ? `Main numbers ${state.main.join(", ")}. Bonus ${state.bonus}.`
            : "Numbers not yet revealed."}
        </p>
        <div className="draw-controls">
          <button
            className="button primary"
            onClick={playing ? () => setPlaying(false) : start}
          >
            {playing
              ? "Pause replay"
              : step
                ? "Replay demo draw"
                : "Watch demo draw"}
            <span aria-hidden="true">▷</span>
          </button>
          {step > 0 && !playing && step < scenario.events.length && (
            <button className="button" onClick={() => setPlaying(true)}>
              Resume replay
            </button>
          )}
          <button className="button" onClick={skip}>
            Skip to results
          </button>
        </div>
      </div>
      <div className="draw-result" role="status">
        <div>
          <p className="eyebrow">
            {state.terminal ? "Demo outcome" : "Draw progress"}
          </p>
          <h2>{state.stage}</h2>
          <p>
            {state.terminal
              ? scenario.description
              : state.provisional
                ? "Numbers matched by multiple tickets. A separate VRF tie-break must confirm one winner before claims become available."
                : step === scenario.events.length
                  ? scenario.description
                  : "Settlement must finish before the original oracle request. Each reveal follows recorded fixture events."}
          </p>
          {state.winningTicket && state.winningTicket !== "0" && (
            <p className="winner">
              Winning ticket #{state.winningTicket} · all inventory
            </p>
          )}
        </div>
        <span className="result-mark">{state.terminal ? "✓" : "◌"}</span>
      </div>
      <details>
        <summary>View the draw sequence</summary>
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
