import { useLayoutEffect, useRef, useState } from "react";
import PlushGlobe from "./PlushGlobe";
export type RevealPhase = "away" | "spinning" | "hold" | "travel";

// The stage and resting slots render the same sphere at the same orientation.
// Progress comes from the draw's clock, so pause freezes both state and pixels.
export default function RevealStage({
  ball,
  number,
  kind,
  phase,
  progress,
  slotId,
  reduced,
}: {
  ball: number;
  number: number | undefined;
  kind: "eth" | "nft";
  phase: RevealPhase;
  progress: number;
  slotId: string;
  reduced: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState({ x: 0, y: 0, scale: 1 });
  useLayoutEffect(() => {
    const measure = () => {
      const globe = ref.current?.querySelector<HTMLElement>(".rg");
      const slot = document.getElementById(slotId);
      if (!globe || !slot || !ref.current) return;
      const from = ref.current.getBoundingClientRect(),
        to = slot.getBoundingClientRect();
      setTarget({
        x: to.left + to.width / 2 - (from.left + from.width / 2),
        y: to.top + to.height / 2 - (from.top + from.height / 2),
        scale: to.width / globe.offsetWidth,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (ref.current) observer.observe(ref.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [slotId, ball]);
  const stopped = phase === "hold" || phase === "travel";
  // Half a turn with a cubic ease out. Back (180°) -> front (0°), never mirrored.
  const angle =
    stopped || number === undefined || reduced
      ? 0
      : phase === "away"
        ? Math.PI
        : Math.PI * Math.pow(1 - progress, 3);
  const travel =
    phase === "travel" ? progress * progress * (3 - 2 * progress) : 0;
  const enter =
    phase === "away" && number !== undefined && !reduced ? 1 - progress : 0;
  return (
    <div
      className="reveal-stage"
      ref={ref}
      data-phase={phase}
      data-ball={ball}
      role="img"
      aria-label={
        number === undefined
          ? "Plush globe lottery ball"
          : stopped
            ? `${ball === 3 ? "Bonus ball" : `Ball ${ball + 1}`}: ${number}`
            : `${ball === 3 ? "Bonus ball" : `Ball ${ball + 1}`} turning; number hidden`
      }
    >
      <div
        className={`rg rg-${kind}`}
        style={{
          transform: `translate(${target.x * travel}px, ${target.y * travel - 22 * enter}px) scale(${1 + (target.scale - 1) * travel - 0.1 * enter})`,
          opacity: number === undefined && ball === 4 ? 0 : 1,
        }}
      >
        <PlushGlobe
          kind={kind}
          angle={angle}
          number={stopped ? number : undefined}
        />
      </div>
    </div>
  );
}
