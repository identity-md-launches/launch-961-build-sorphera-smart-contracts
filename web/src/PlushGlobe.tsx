import { useLayoutEffect, useRef } from "react";
import land from "./earth-land.json";

// Natural Earth 1:110m public-domain land outlines (see THIRD_PARTY_NOTICES).
// A small CPU texture mapper: every pixel is a ray/sphere intersection, not
// a sliding map or rotating disc. Both geography and badge use the same UVs.
const W = 1024,
  H = 512,
  SIZE = 256;
const textures = new Map<string, Uint8ClampedArray>();
const frames = new Map<string, ImageData>();
const TAU = Math.PI * 2;
const CENTER = -25;
function texture(kind: "eth" | "nft", number?: number | string) {
  const key = `${kind}:${number ?? "blank"}`;
  const cached = textures.get(key);
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  if (number !== undefined) {
    // Reuse the felt map; drawing a new result never rebuilds its geography
    // or half a million fibre samples on the animation's stopping frame.
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(texture(kind)), W, H),
      0,
      0,
    );
    ctx.fillStyle = "#302732";
    ctx.font = "bold 78px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      typeof number === "number" ? String(number).padStart(2, "0") : number,
      ((CENTER + 180) / 360) * W,
      H / 2 + 4,
    );
    const pixels = ctx.getImageData(0, 0, W, H).data;
    if (textures.size >= 6) {
      const disposable = [...textures.keys()].find(
        (k) => !k.endsWith(":blank"),
      );
      if (disposable) textures.delete(disposable);
    }
    textures.set(key, pixels);
    return pixels;
  }
  ctx.fillStyle = kind === "eth" ? "#a1d5ea" : "#efa3c6";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = kind === "eth" ? "#eea6c7" : "#f7e5d4";
  ctx.shadowColor = kind === "eth" ? "#5b6d8060" : "#99567660";
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 1.5;
  for (const ring of land) {
    ctx.beginPath();
    ring.forEach(([lon, lat], i) => {
      const x = ((lon + 180) / 360) * W,
        y = ((90 - lat) / 180) * H;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  // Cream felt patch, attached at the front meridian. No photographed digits.
  const bx = ((CENTER + 180) / 360) * W,
    by = H / 2;
  const radius = (26 / 360) * W;
  ctx.beginPath();
  ctx.arc(bx, by, radius, 0, TAU);
  ctx.fillStyle = "#f5e8d7";
  ctx.fill();
  ctx.strokeStyle = "#c8ab963d";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(bx, by, radius - 6, 0, TAU);
  ctx.strokeStyle = "#b5a39399";
  ctx.lineWidth = 1.3;
  ctx.setLineDash([2.4, 3.5]);
  ctx.stroke();
  ctx.setLineDash([]);
  const pixels = ctx.getImageData(0, 0, W, H).data;
  // Deterministic fine fibres and soft clumps travel with the fabric.
  let seed = 1741;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = ((seed >>> 24) / 255 - 0.5) * 0.17;
      const nap = Math.sin(x * 1.7 + Math.sin(y * 0.65)) * 0.022;
      const clump = Math.sin(x * 0.19) * Math.sin(y * 0.24) * 0.024;
      const factor = 1 + noise + nap + clump;
      const i = (y * W + x) * 4;
      for (let ch = 0; ch < 3; ch++) pixels[i + ch] *= factor;
    }
  textures.set(key, pixels);
  return pixels;
}
// Precomputed surface latitude, longitude, light and soft silhouette.
const rays: {
  i: number;
  u: number;
  row: number;
  light: number;
  alpha: number;
}[] = [];
for (let y = 0; y < SIZE; y++)
  for (let x = 0; x < SIZE; x++) {
    const nx = (x + 0.5 - SIZE / 2) / (SIZE * 0.488);
    const ny = (SIZE / 2 - y - 0.5) / (SIZE * 0.488);
    const r = Math.hypot(nx, ny);
    const fuzz = Math.sin(x * 7.13 + y * 2.37) * 0.003;
    if (r > 1 + fuzz) continue;
    const nz = Math.sqrt(Math.max(0, 1 - r * r));
    const u = Math.atan2(nx, nz) / TAU;
    const row = Math.min(
      H - 1,
      Math.floor(
        (0.5 - Math.asin(Math.max(-1, Math.min(1, ny))) / Math.PI) * H,
      ),
    );
    const diffuse = Math.max(0, -0.4 * nx + 0.5 * ny + 0.77 * nz);
    rays.push({
      i: (y * SIZE + x) * 4,
      u,
      row,
      light: 0.5 + 0.49 * diffuse,
      alpha: Math.max(0, Math.min(1, ((1 + fuzz - r) * SIZE) / 1.4)) * 255,
    });
  }
export function paintGlobe(
  canvas: HTMLCanvasElement,
  kind: "eth" | "nft",
  angle: number,
  number?: number | string,
) {
  const ctx = canvas.getContext("2d")!;
  const key = `${kind}:${number ?? "blank"}`;
  if (angle === 0 && frames.has(key)) {
    ctx.putImageData(frames.get(key)!, 0, 0);
    return;
  }
  const source = texture(kind, number),
    frame = ctx.createImageData(SIZE, SIZE);
  const shift = (CENTER + 180) / 360 + angle / TAU;
  for (const ray of rays) {
    const u = (((ray.u + shift) % 1) + 1) % 1;
    const p = (ray.row * W + Math.floor(u * W)) * 4;
    for (let ch = 0; ch < 3; ch++)
      frame.data[ray.i + ch] = source[p + ch] * ray.light;
    frame.data[ray.i + 3] = ray.alpha;
  }
  ctx.putImageData(frame, 0, 0);
  if (angle === 0) frames.set(key, frame);
}
export default function PlushGlobe({
  kind = "eth",
  number,
  angle = 0,
}: {
  kind?: "eth" | "nft";
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
