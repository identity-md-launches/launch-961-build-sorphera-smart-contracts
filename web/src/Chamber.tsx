import { useLayoutEffect, useRef, useState } from "react";

export type RevealPhase = "away" | "spinning" | "hold" | "travel";

// Plush sphere built from CSS: a shaded ball, a continents layer that pans
// around the curved surface, and a cream badge attached in 3D on the sphere's
// front. The badge starts facing away (hidden behind the ball), the stage
// rotates and decelerates to a stop with the badge facing the camera.
// The number is supplied; nothing here chooses or changes it.
export function RevealGlobe({
  number,
  kind,
  phase,
  spinMs,
  travelMs,
  paused,
  target,
}: {
  number: number;
  kind: "eth" | "nft";
  phase: RevealPhase;
  spinMs: number;
  travelMs: number;
  paused: boolean;
  /** Offset to the result slot, used during the travel phase. */
  target?: { x: number; y: number; scale: number };
}) {
  const style = {
    "--spin": `${spinMs}ms`,
    "--travel": `${travelMs}ms`,
    "--tx": `${target?.x ?? 0}px`,
    "--ty": `${target?.y ?? 0}px`,
    "--ts": `${target?.scale ?? 1}`,
  } as React.CSSProperties;
  return (
    <div
      className={`rg rg-${kind} rg-${phase} ${paused ? "rg-paused" : ""}`}
      style={style}
      aria-hidden="true"
    >
      <div className="rg-3d">
        <div className="rg-sphere">
          <div className="rg-continents" />
          <div className="rg-shade" />
        </div>
        <div className="rg-badge-stage">
          <span className="rg-badge">{String(number).padStart(2, "0")}</span>
        </div>
      </div>
      <div className="rg-shadow" />
    </div>
  );
}

export default function RevealStage({
  ball,
  number,
  kind,
  phase,
  spinMs,
  travelMs,
  paused,
  slotId,
}: {
  ball: number;
  number: number | undefined;
  kind: "eth" | "nft";
  phase: RevealPhase;
  spinMs: number;
  travelMs: number;
  paused: boolean;
  slotId: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<{
    x: number;
    y: number;
    scale: number;
  }>();
  useLayoutEffect(() => {
    if (phase !== "travel" || !ref.current) return;
    const slot = document.getElementById(slotId);
    const from = ref.current.getBoundingClientRect();
    if (!slot) return;
    const to = slot.getBoundingClientRect();
    setTarget({
      x: to.left + to.width / 2 - (from.left + from.width / 2),
      y: to.top + to.height / 2 - (from.top + from.height / 2),
      scale: to.width / from.width,
    });
  }, [phase, slotId, ball]);
  return (
    <div className="reveal-stage" ref={ref}>
      {number === undefined ? (
        <div className={`rg rg-${kind} rg-idle`} aria-hidden="true">
          <div className="rg-3d">
            <div className="rg-sphere">
              <div className="rg-continents" />
              <div className="rg-shade" />
            </div>
          </div>
          <div className="rg-shadow" />
        </div>
      ) : (
        <RevealGlobe
          key={ball}
          number={number}
          kind={kind}
          phase={phase}
          spinMs={spinMs}
          travelMs={travelMs}
          paused={paused}
          target={target}
        />
      )}
    </div>
  );
}
