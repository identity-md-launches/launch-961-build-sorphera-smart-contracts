import { useLayoutEffect, useRef } from "react";
import land from "./earth-land.json";

// One plush globe asset family, rendered from a single textured sphere model.
// Material values were sampled from the photographed references in
// public/brand (eth-ball.webp, nft-ball.webp, the brand board): felt base
// with fibre nap, quilted stitched seams, raised felt continents with rounded
// edges and contact shadows, a padded cream badge with a stitched rim, and
// bold rounded black numerals. Digits are drawn on a blank badge at render
// time; nothing is a photographed crop, a mirrored frame or a flat disc.
// Every pixel is a ray/sphere intersection, so badge and digits follow the
// curved surface in every orientation and the same renderer serves the
// picker, baskets, receipts, My tickets, the reveal stage and its slots.
export type GlobeKind = "eth" | "nft" | "ca" | "jp" | "br";
const W = 1024,
  H = 512,
  SIZE = 256;
const TAU = Math.PI * 2;
interface Material {
  base: string;
  baseDeep: string;
  land: string;
  landLit: string;
  landShade: string;
  seam: string;
  stitch: string;
  /** Longitude facing the viewer when angle = 0. */
  center: number;
}
const materials: Record<GlobeKind, Material> = {
  // Ice-blue felt with pink continents (eth-ball.webp).
  eth: {
    base: "#86b0d6",
    baseDeep: "#5a84ac",
    land: "#f08fbd",
    landLit: "#ffa9d4",
    landShade: "#b25c78",
    seam: "#4f6f91",
    stitch: "#c6dcee",
    center: -25,
  },
  // Blossom-pink felt with cream continents (nft-ball.webp). Bonus ball.
  nft: {
    base: "#f08aa8",
    baseDeep: "#c9647f",
    land: "#f6dfd0",
    landLit: "#fff0e6",
    landShade: "#b08682",
    seam: "#a9506d",
    stitch: "#ffd3df",
    center: -25,
  },
  // Sorphera Atlas concept artwork: plush country globes.
  ca: {
    base: "#d8404b",
    baseDeep: "#b02f3a",
    land: "#f7ede0",
    landLit: "#fffaf2",
    landShade: "#b89d94",
    seam: "#7d1f27",
    stitch: "#f4b3b8",
    center: -96,
  },
  jp: {
    base: "#f3b9c9",
    baseDeep: "#dc96ac",
    land: "#d9343f",
    landLit: "#ef5a63",
    landShade: "#8f1f28",
    seam: "#b47286",
    stitch: "#ffe3eb",
    center: 138,
  },
  br: {
    base: "#2f9a5c",
    baseDeep: "#237a48",
    land: "#f5d33f",
    landLit: "#ffe879",
    landShade: "#b8992a",
    seam: "#14593a",
    stitch: "#a9dcbd",
    center: -52,
  },
};
const BADGE_DEG = 22; // badge radius as an angle on the sphere (~0.36 R)
const textures = new Map<string, Uint8ClampedArray>();
const frames = new Map<string, ImageData>();

function tracePath(ctx: CanvasRenderingContext2D, dx = 0, dy = 0) {
  ctx.beginPath();
  for (const ring of land) {
    ring.forEach(([lon, lat], i) => {
      const x = ((lon + 180) / 360) * W + dx,
        y = ((90 - lat) / 180) * H + dy;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }
}
function drawLand(
  ctx: CanvasRenderingContext2D,
  color: string,
  dx: number,
  dy: number,
  width: number,
) {
  // Stroking the outline with round joins gives the felt its soft, rounded
  // cut edges instead of a flat printed map.
  tracePath(ctx, dx, dy);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.fill();
}
function blankTexture(kind: GlobeKind) {
  const m = materials[kind];
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  // Felt base with a gentle vertical tone so panels read as fabric, not paint.
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, m.base);
  grad.addColorStop(0.5, m.base);
  grad.addColorStop(1, m.baseDeep);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  // Quilted seams: meridians every 45° and three parallels, each a soft
  // pressed groove with a lighter running stitch beside it.
  ctx.lineCap = "round";
  const seamAt = (draw: () => void) => {
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = m.seam;
    ctx.lineWidth = 5;
    ctx.setLineDash([]);
    draw();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = m.stitch;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 7]);
    draw();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
  };
  for (let i = 0; i < 8; i++) {
    const x = (i / 8) * W;
    seamAt(() => {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    });
  }
  for (const lat of [-45, 0, 45]) {
    const y = ((90 - lat) / 180) * H;
    seamAt(() => {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    });
  }
  // Raised felt continents: contact shadow, lit rim peeking at the top-left,
  // then the felt body with rounded edges and a shaded lower-right rim.
  ctx.save();
  ctx.filter = "blur(3px)";
  ctx.globalAlpha = 0.55;
  drawLand(ctx, m.landShade, 4, 6, 7);
  ctx.restore();
  ctx.globalAlpha = 0.9;
  drawLand(ctx, m.landShade, 2.5, 3.5, 7.5);
  ctx.globalAlpha = 1;
  drawLand(ctx, m.landLit, -2, -2.5, 7.5);
  drawLand(ctx, m.land, 0, 0, 5.5);
  // Padded cream badge stitched onto the front meridian. Blank: digits are
  // added per number so one asset family serves every ball.
  const bx = ((m.center + 180) / 360) * W,
    by = H / 2;
  const r = (BADGE_DEG / 360) * W;
  ctx.save();
  ctx.filter = "blur(4px)";
  ctx.fillStyle = "#2a1c22";
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(bx + 3, by + 6, r + 2, 0, TAU);
  ctx.fill();
  ctx.restore();
  const pad = ctx.createRadialGradient(bx - r * 0.3, by - r * 0.35, r * 0.1, bx, by, r);
  pad.addColorStop(0, "#fbf3e7");
  pad.addColorStop(0.72, "#f1e3d0");
  pad.addColorStop(1, "#d9c5ae");
  ctx.fillStyle = pad;
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, TAU);
  ctx.fill();
  // Rim: pressed groove and a running stitch, like the photographed badge.
  ctx.strokeStyle = "#b99e86";
  ctx.lineWidth = 2.2;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.arc(bx, by, r - 5, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = "#8f7762";
  ctx.lineWidth = 1.4;
  ctx.setLineDash([3, 3.5]);
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.arc(bx, by, r - 9, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  const pixels = ctx.getImageData(0, 0, W, H).data;
  // Deterministic fibre nap and soft clumps travel with the fabric. The badge
  // and continents keep a lighter nap so they still read as felt.
  let seed = 1741;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = ((seed >>> 24) / 255 - 0.5) * 0.2;
      const nap = Math.sin(x * 1.7 + Math.sin(y * 0.65)) * 0.025;
      const clump =
        Math.sin(x * 0.19 + y * 0.07) * Math.sin(y * 0.24 - x * 0.05) * 0.03;
      const factor = 1 + noise + nap + clump;
      const i = (y * W + x) * 4;
      for (let ch = 0; ch < 3; ch++) pixels[i + ch] *= factor;
    }
  return pixels;
}
function texture(kind: GlobeKind, number?: number | string) {
  const key = `${kind}:${number ?? "blank"}`;
  const cached = textures.get(key);
  if (cached) return cached;
  if (number === undefined) {
    const pixels = blankTexture(kind);
    textures.set(key, pixels);
    return pixels;
  }
  // Reuse the blank felt map; drawing a result never rebuilds geography or
  // half a million fibre samples on the animation's stopping frame.
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(texture(kind)), W, H), 0, 0);
  const m = materials[kind];
  const bx = ((m.center + 180) / 360) * W,
    by = H / 2;
  const text =
    typeof number === "number" ? String(number).padStart(2, "0") : number;
  const size = text.length > 2 ? 58 : 84;
  ctx.font = `900 ${size}px "Arial Rounded MT Bold", "Nunito", "Arial Black", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  // Soft print shadow, then rounded heavy strokes and the fill.
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = "#9c8468";
  ctx.lineWidth = 9;
  ctx.strokeText(text, bx + 1.5, by + 6);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#1f1a1d";
  ctx.lineWidth = 7;
  ctx.strokeText(text, bx, by + 3);
  ctx.fillStyle = "#1f1a1d";
  ctx.fillText(text, bx, by + 3);
  const pixels = ctx.getImageData(0, 0, W, H).data;
  if (textures.size >= 12) {
    const disposable = [...textures.keys()].find((k) => !k.endsWith(":blank"));
    if (disposable) textures.delete(disposable);
  }
  textures.set(key, pixels);
  return pixels;
}
// Precomputed surface latitude, longitude, light and soft fuzzy silhouette.
// Light sits high and slightly left, as in the reference photography, with a
// deep falloff into the lower hemisphere and a soft sheen near the top.
const rays: { i: number; u: number; row: number; light: number; alpha: number }[] =
  [];
for (let y = 0; y < SIZE; y++)
  for (let x = 0; x < SIZE; x++) {
    const nx = (x + 0.5 - SIZE / 2) / (SIZE * 0.488);
    const ny = (SIZE / 2 - y - 0.5) / (SIZE * 0.488);
    const r = Math.hypot(nx, ny);
    const fuzz =
      Math.sin(x * 7.13 + y * 2.37) * 0.0035 + Math.sin(x * 1.3 - y * 3.1) * 0.002;
    if (r > 1 + fuzz) continue;
    const nz = Math.sqrt(Math.max(0, 1 - r * r));
    const u = Math.atan2(nx, nz) / TAU;
    const row = Math.min(
      H - 1,
      Math.floor((0.5 - Math.asin(Math.max(-1, Math.min(1, ny))) / Math.PI) * H),
    );
    const diffuse = Math.max(0, -0.22 * nx + 0.62 * ny + 0.75 * nz);
    const sheen = Math.pow(diffuse, 7) * 0.14;
    const rim = Math.pow(r, 6) * 0.22;
    rays.push({
      i: (y * SIZE + x) * 4,
      u,
      row,
      light: Math.min(1.04, 0.24 + 0.84 * diffuse + sheen - rim),
      alpha: Math.max(0, Math.min(1, ((1 + fuzz - r) * SIZE) / 1.6)) * 255,
    });
  }
export function paintGlobe(
  canvas: HTMLCanvasElement,
  kind: GlobeKind,
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
  const shift = (materials[kind].center + 180) / 360 + angle / TAU;
  for (const ray of rays) {
    const u = (((ray.u + shift) % 1) + 1) % 1;
    const p = (ray.row * W + Math.floor(u * W)) * 4;
    for (let ch = 0; ch < 3; ch++)
      frame.data[ray.i + ch] = source[p + ch] * ray.light;
    frame.data[ray.i + 3] = ray.alpha;
  }
  ctx.putImageData(frame, 0, 0);
  // Picker and resting renders are cached per kind and number.
  if (angle === 0) frames.set(key, frame);
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
