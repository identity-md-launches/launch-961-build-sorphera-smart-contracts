import { useLayoutEffect, useRef } from "react";
import { loadPlushModel, renderPlush, type GlobeKind } from "./plushModel";
export type { GlobeKind } from "./plushModel";

// Every surface shares the photo-derived displaced model and curved printing.
const SIZE = 256;
const fronts = new Map<string, HTMLCanvasElement>();
const requested = new WeakMap<HTMLCanvasElement, object>();
export function paintGlobe(
  canvas: HTMLCanvasElement,
  kind: GlobeKind,
  angle: number,
  number?: number | string,
) {
  const request = {};
  requested.set(canvas, request);
  const key = `${kind}:${number ?? "blank"}`;
  loadPlushModel()
    .then(() => {
      // Asset loading cannot repaint a superseded angle or obsolete number.
      if (requested.get(canvas) !== request) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, SIZE, SIZE);
      const cached = angle === 0 ? fronts.get(key) : undefined;
      if (cached) {
        ctx.drawImage(cached, 0, 0);
        canvas.dataset.renderer = cached.dataset.renderer;
        return;
      }
      renderPlush(canvas, kind, angle, number);
      if (angle === 0) {
        const copy = document.createElement("canvas");
        copy.width = copy.height = SIZE;
        copy.getContext("2d")!.drawImage(canvas, 0, 0);
        copy.dataset.renderer = canvas.dataset.renderer;
        fronts.set(key, copy);
      }
    })
    .catch(() => {
      canvas.dataset.unavailable = "true";
    });
}
export default function PlushGlobe({
  kind = "eth",
  number,
  angle = 0,
}: {
  kind?: GlobeKind;
  number?: number | string;
  angle?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    if (ref.current) paintGlobe(ref.current, kind, angle, number);
  }, [kind, number, angle]);
  return (
    <canvas
      ref={ref}
      className="plush-globe"
      width={SIZE}
      height={SIZE}
      aria-hidden="true"
    />
  );
}
