// One photo-derived displaced cloth mesh, with complete side/rear geometry.
// Albedo retains photographed felt, applique shadows and the blank padded badge.
// The second map supplies applique/badge masks and cloth displacement. Both
// renderers use the same geometry, material, light and curved badge coordinates.
export type GlobeKind = "eth" | "nft" | "ca" | "jp" | "br";
const SIZE = 256,
  NX = 128,
  NY = 96,
  TAU = Math.PI * 2,
  R = 121.5;
type Model = {
  pixels: Uint8ClampedArray;
  map: Uint8ClampedArray;
  width: number;
  height: number;
  vertices: Float32Array;
  indices: Uint16Array;
  normals: Float32Array;
  albedo: HTMLImageElement;
  surface: HTMLImageElement;
};
let model: Model;
let loading: Promise<void> | undefined;
let gpu: ReturnType<typeof createGPU> | undefined;
const materials: Record<GlobeKind, [number[], number[]]> = {
  eth: [
    [1, 1, 1],
    [1, 1, 1],
  ],
  nft: [
    [224 / 146, 130 / 146, 158 / 146],
    [243 / 167, 221 / 167, 204 / 167],
  ],
  ca: [
    [195 / 146, 54 / 146, 66 / 146],
    [244 / 167, 231 / 167, 212 / 167],
  ],
  jp: [
    [237 / 146, 173 / 146, 190 / 146],
    [191 / 167, 43 / 167, 55 / 167],
  ],
  br: [
    [51 / 146, 142 / 146, 76 / 146],
    [246 / 167, 209 / 167, 55 / 167],
  ],
};
function image(name: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `${import.meta.env.BASE_URL}brand/plush/${name}`;
  });
}
function pixels(img: HTMLImageElement) {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height).data;
}
export function loadPlushModel(): Promise<void> {
  return (loading ??= Promise.all([
    image("albedo.webp"),
    image("surface.webp"),
  ]).then(([albedo, surface]) => {
    const map = pixels(surface),
      width = surface.width,
      height = surface.height;
    const vertices: number[] = [],
      indices: number[] = [];
    for (let j = 0; j <= NY; j++)
      for (let i = 0; i <= NX; i++) {
        const u = i / NX,
          v = j / NY,
          lon = (u - 0.5) * TAU,
          lat = (0.5 - v) * Math.PI;
        const p =
          (Math.min(height - 1, Math.floor(v * height)) * width +
            Math.min(width - 1, Math.floor(u * width))) *
          4;
        const r = 1 + (map[p + 2] / 255) * 0.09 - 0.012;
        const x = Math.sin(lon) * Math.cos(lat),
          y = Math.sin(lat),
          z = Math.cos(lon) * Math.cos(lat);
        vertices.push(x * r, y * r * 1.015, z * r, u, v, x, y, z);
      }
    for (let j = 0; j < NY; j++)
      for (let i = 0; i < NX; i++) {
        const a = j * (NX + 1) + i,
          b = a + 1,
          c = a + NX + 1,
          d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    const normals = new Float32Array((vertices.length / 8) * 3);
    for (let j = 0; j <= NY; j++)
      for (let i = 0; i <= NX; i++) {
        const n = j * (NX + 1) + i,
          p = n * 8;
        const left = (j * (NX + 1) + Math.max(0, i - 1)) * 8,
          right = (j * (NX + 1) + Math.min(NX, i + 1)) * 8;
        const up = (Math.max(0, j - 1) * (NX + 1) + i) * 8,
          down = (Math.min(NY, j + 1) * (NX + 1) + i) * 8;
        const tx = [0, 1, 2].map(
            (k) => vertices[right + k] - vertices[left + k],
          ),
          ty = [0, 1, 2].map((k) => vertices[down + k] - vertices[up + k]);
        let normal = [
          ty[1] * tx[2] - ty[2] * tx[1],
          ty[2] * tx[0] - ty[0] * tx[2],
          ty[0] * tx[1] - ty[1] * tx[0],
        ];
        const length = Math.hypot(...normal);
        normal = normal.map((x, k) =>
          length > 1e-8
            ? (x / length) * 0.65 + vertices[p + 5 + k] * 0.35
            : vertices[p + 5 + k],
        );
        const len = Math.hypot(...normal);
        normals.set(
          normal.map((x) => x / len),
          n * 3,
        );
      }
    model = {
      pixels: pixels(albedo),
      map,
      width,
      height,
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices),
      normals,
      albedo,
      surface,
    };
    try {
      gpu = createGPU();
    } catch {
      gpu = undefined;
    }
  }));
}
// Rounded print paths avoid platform font substitution. The transparent ink
// texture follows the curved badge, leaving all fabric and padded rim intact.
const glyphs: Record<string, string> = {
  "0": "M31 12 C5 12 5 88 31 88 C57 88 57 12 31 12 Z",
  "1": "M17 29 L34 12 L34 88",
  "2": "M10 28 C12 3 56 6 53 32 C50 49 21 60 10 87 L55 87",
  "3": "M10 17 C54 0 65 40 33 47 C68 46 59 102 9 82",
  "4": "M43 88 L43 12 L9 65 L57 65",
  "5": "M53 13 L15 13 L12 46 C64 29 67 105 10 83",
  "6": "M48 15 C10 3 1 88 31 88 C66 88 61 40 31 44 C11 45 9 70 15 79",
  "7": "M9 13 L55 13 L23 88",
  "8": "M31 48 C-1 42 7 10 31 12 C57 10 64 42 31 48 C-5 53 3 89 31 89 C61 89 66 52 31 48",
  "9": "M15 85 C54 99 62 12 32 12 C0 12 0 58 32 57 C52 56 53 31 47 23",
  C: "M53 19 C7 -9 -2 108 53 82",
  A: "M7 88 L30 12 L56 88 M15 63 L47 63",
  J: "M52 12 L52 68 C52 94 12 97 9 73",
  P: "M11 88 L11 12 L35 12 C68 12 65 53 35 53 L11 53",
  B: "M11 88 L11 12 L34 12 C61 12 61 47 34 47 L11 47 M34 47 C68 47 67 88 34 88 L11 88",
  R: "M11 88 L11 12 L35 12 C68 12 65 51 35 51 L11 51 M33 51 L57 88",
  "+": "M9 50 L53 50 M31 27 L31 73",
  "?": "M11 26 C13 2 56 5 53 31 C50 45 31 45 31 62 M31 86 L31 86.2",
};
const inks = new Map<string, HTMLCanvasElement>();
function ink(number?: number | string) {
  const text =
    number === undefined
      ? ""
      : typeof number === "number"
        ? String(number).padStart(2, "0")
        : number;
  const cached = inks.get(text);
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const scale = text.length > 2 ? 1.25 : 1.65;
  ctx.translate((256 - text.length * 66 * scale) / 2, 128 - 50 * scale);
  ctx.scale(scale, scale);
  ctx.strokeStyle = "#211c20";
  ctx.lineWidth = 22;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const char of text) {
    if (glyphs[char]) ctx.stroke(new Path2D(glyphs[char]));
    ctx.translate(66, 0);
  }
  inks.set(text, c);
  return c;
}
function createGPU() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
    premultipliedAlpha: false,
  });
  if (!gl) return;
  const vertex = `attribute vec3 position; attribute vec2 uv; attribute vec3 normal;attribute vec3 surfaceNormal;
    uniform float angle; varying vec2 tex; varying vec3 original; varying vec3 rotated;
    void main(){float c=cos(angle),s=sin(angle);vec3 p=vec3(c*position.x-s*position.z,position.y,s*position.x+c*position.z);
      original=normal;rotated=vec3(c*surfaceNormal.x-s*surfaceNormal.z,surfaceNormal.y,s*surfaceNormal.x+c*surfaceNormal.z);tex=uv;
      gl_Position=vec4(p.x*.94921875,p.y*.94921875,-p.z*.5,1.);}`;
  const fragment = `precision mediump float; uniform sampler2D albedo;uniform sampler2D surface;uniform sampler2D ink;
    uniform vec3 baseColor;uniform vec3 landColor;uniform float recolor;varying vec2 tex;varying vec3 original;varying vec3 rotated;
    void main(){vec3 m=texture2D(surface,tex).rgb; vec3 c=texture2D(albedo,tex).rgb;
      float luminance=dot(c,vec3(.2126,.7152,.0722));
      c=mix(c,luminance*mix(baseColor,landColor,m.r),recolor*(1.-m.g));
      vec3 light=vec3(-.25,.52,.81);
      float ref=.52+.48*max(0.,dot(original,light));float lit=.52+.48*max(0.,dot(normalize(rotated),light));
      vec2 printUV=vec2(original.x/.60+.5, .5-(original.y-.005)/.60);
      if(m.g>.5 && original.z>.85 && min(printUV.x,printUV.y)>=0. && max(printUV.x,printUV.y)<=1.) {
        vec4 mark=texture2D(ink,printUV);c=mix(c,mark.rgb,mark.a);}
      float cap=1.08+(1.-smoothstep(.28,.58,original.z));
      gl_FragColor=vec4(c*min(lit/ref,cap),1.);}`;
  function shader(type: number, source: string) {
    const sh = gl!.createShader(type)!;
    gl!.shaderSource(sh, source);
    gl!.compileShader(sh);
    if (!gl!.getShaderParameter(sh, gl!.COMPILE_STATUS))
      throw Error(gl!.getShaderInfoLog(sh) || "shader");
    return sh;
  }
  const program = gl.createProgram()!;
  gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw Error("plush program");
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, model.vertices, gl.STATIC_DRAW);
  for (const [name, size, offset] of [
    ["position", 3, 0],
    ["uv", 2, 12],
    ["normal", 3, 20],
  ] as const) {
    const a = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, size, gl.FLOAT, false, 32, offset);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, model.normals, gl.STATIC_DRAW);
  const normalAttribute = gl.getAttribLocation(program, "surfaceNormal");
  gl.enableVertexAttribArray(normalAttribute);
  gl.vertexAttribPointer(normalAttribute, 3, gl.FLOAT, false, 12, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, model.indices, gl.STATIC_DRAW);
  function upload(source: TexImageSource, unit: number, name: string) {
    gl!.activeTexture(gl!.TEXTURE0 + unit);
    gl!.bindTexture(gl!.TEXTURE_2D, gl!.createTexture());
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RGBA,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      source,
    );
    gl!.uniform1i(gl!.getUniformLocation(program, name), unit);
  }
  upload(model.albedo, 0, "albedo");
  upload(model.surface, 1, "surface");
  upload(ink(), 2, "ink");
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 0);
  let lastInk: HTMLCanvasElement;
  return {
    canvas,
    draw(kind: GlobeKind, angle: number, print: HTMLCanvasElement) {
      if (gl.isContextLost()) return false;
      gl.uniform1f(gl.getUniformLocation(program, "angle"), angle);
      gl.uniform1f(
        gl.getUniformLocation(program, "recolor"),
        kind === "eth" ? 0 : 1,
      );
      gl.uniform3fv(
        gl.getUniformLocation(program, "baseColor"),
        materials[kind][0],
      );
      gl.uniform3fv(
        gl.getUniformLocation(program, "landColor"),
        materials[kind][1],
      );
      if (lastInk !== print) {
        gl.activeTexture(gl.TEXTURE2);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          print,
        );
        lastInk = print;
      }
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.drawElements(gl.TRIANGLES, model.indices.length, gl.UNSIGNED_SHORT, 0);
      return true;
    },
  };
}
// Triangle rasterization when WebGL is unavailable, using the SAME mesh.
function software(
  ctx: CanvasRenderingContext2D,
  kind: GlobeKind,
  angle: number,
  print: HTMLCanvasElement,
) {
  const frame = ctx.createImageData(SIZE, SIZE),
    depth = new Float32Array(SIZE * SIZE).fill(-Infinity);
  const inkData = print.getContext("2d")!.getImageData(0, 0, 256, 256).data;
  const verts = model.vertices,
    transformed = new Float32Array((verts.length / 8) * 3),
    c = Math.cos(angle),
    s = Math.sin(angle);
  for (let i = 0; i < verts.length / 8; i++) {
    const v = i * 8;
    transformed[i * 3] = 128 + R * (c * verts[v] - s * verts[v + 2]);
    transformed[i * 3 + 1] = 128 - R * verts[v + 1];
    transformed[i * 3 + 2] = s * verts[v] + c * verts[v + 2];
  }
  const [base, land] = materials[kind];
  for (let t = 0; t < model.indices.length; t += 3) {
    const ia = model.indices[t],
      ib = model.indices[t + 1],
      ic = model.indices[t + 2],
      a = ia * 3,
      b = ib * 3,
      d = ic * 3;
    const ax = transformed[a],
      ay = transformed[a + 1],
      bx = transformed[b],
      by = transformed[b + 1],
      cx = transformed[d],
      cy = transformed[d + 1];
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 0.001) continue;
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx))),
      maxX = Math.min(255, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy))),
      maxY = Math.min(255, Math.ceil(Math.max(ay, by, cy)));
    for (let yy = minY; yy <= maxY; yy++)
      for (let xx = minX; xx <= maxX; xx++) {
        const w1 =
            ((by - cy) * (xx + 0.5 - cx) + (cx - bx) * (yy + 0.5 - cy)) / den,
          w2 =
            ((cy - ay) * (xx + 0.5 - cx) + (ax - cx) * (yy + 0.5 - cy)) / den,
          w3 = 1 - w1 - w2;
        if (Math.min(w1, w2, w3) < -0.0001) continue;
        const zz =
            w1 * transformed[a + 2] +
            w2 * transformed[b + 2] +
            w3 * transformed[d + 2],
          p = yy * 256 + xx;
        if (zz <= depth[p]) continue;
        depth[p] = zz;
        const mix = (n: number) =>
          w1 * verts[ia * 8 + n] +
          w2 * verts[ib * 8 + n] +
          w3 * verts[ic * 8 + n];
        const u = mix(3),
          v = mix(4),
          ox = mix(5),
          oy = mix(6),
          oz = mix(7);
        const q =
          (Math.min(model.height - 1, Math.floor(v * model.height)) *
            model.width +
            Math.min(model.width - 1, Math.floor(u * model.width))) *
          4;
        const lm = model.map[q] / 255,
          bm = model.map[q + 1] / 255;
        const surfaceNormal = [0, 1, 2].map(
          (k) =>
            w1 * model.normals[ia * 3 + k] +
            w2 * model.normals[ib * 3 + k] +
            w3 * model.normals[ic * 3 + k],
        );
        const normalLength = Math.hypot(...surfaceNormal),
          snx = (c * surfaceNormal[0] - s * surfaceNormal[2]) / normalLength,
          sny = surfaceNormal[1] / normalLength,
          snz = (s * surfaceNormal[0] + c * surfaceNormal[2]) / normalLength;
        const weight = Math.max(0, Math.min(1, (oz - 0.28) / 0.3));
        const light = Math.min(
          (0.52 + 0.48 * Math.max(0, -0.25 * snx + 0.52 * sny + 0.81 * snz)) /
            (0.52 + 0.48 * Math.max(0, -0.25 * ox + 0.52 * oy + 0.81 * oz)),
          2.08 - weight * weight * (3 - 2 * weight),
        );
        const ix = Math.floor((ox / 0.6 + 0.5) * 256),
          iy = Math.floor((0.5 - (oy - 0.005) / 0.6) * 256),
          ip = (iy * 256 + ix) * 4;
        const alpha =
          bm > 0.5 && oz > 0.85 && ix >= 0 && ix < 256 && iy >= 0 && iy < 256
            ? inkData[ip + 3] / 255
            : 0;
        for (let ch = 0; ch < 3; ch++) {
          const lum =
            model.pixels[q] * 0.2126 +
            model.pixels[q + 1] * 0.7152 +
            model.pixels[q + 2] * 0.0722;
          const color =
            kind === "eth"
              ? model.pixels[q + ch]
              : lum * (base[ch] * (1 - lm) + land[ch] * lm) * (1 - bm) +
                model.pixels[q + ch] * bm;
          frame.data[p * 4 + ch] =
            (color * (1 - alpha) + (inkData[ip + ch] || 0) * alpha) * light;
        }
        frame.data[p * 4 + 3] = 255;
      }
  }
  ctx.putImageData(frame, 0, 0);
}
// Fine curved fibres rotate with the cloth at the silhouette. They are actual
// surface-anchored strands, independent of the photographed albedo's detail.
function fibres(ctx: CanvasRenderingContext2D, kind: GlobeKind, angle: number) {
  const c = Math.cos(angle),
    s = Math.sin(angle),
    [base, land] = materials[kind];
  let seed = 37;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 2200; i++) {
    const u = rand(),
      v = Math.acos(2 * rand() - 1) / Math.PI,
      lon = (u - 0.5) * TAU,
      lat = (0.5 - v) * Math.PI;
    const x = Math.sin(lon) * Math.cos(lat),
      y = Math.sin(lat),
      z = Math.cos(lon) * Math.cos(lat),
      rx = c * x - s * z,
      rz = s * x + c * z;
    const length = 0.006 + rand() * 0.017,
      bend = (rand() - 0.5) * 0.012;
    if (rz < -0.02 || rz > 0.29) continue;
    const p =
        (Math.min(model.height - 1, Math.floor(v * model.height)) *
          model.width +
          Math.floor(u * model.width)) *
        4,
      lm = model.map[p] / 255,
      bm = model.map[p + 1] / 255;
    const r = 1 + (model.map[p + 2] / 255) * 0.09 - 0.012;
    const light =
      (0.52 + 0.48 * Math.max(0, -0.25 * rx + 0.52 * y + 0.81 * rz)) /
      (0.52 + 0.48 * Math.max(0, -0.25 * x + 0.52 * y + 0.81 * z));
    const lum =
      model.pixels[p] * 0.2126 +
      model.pixels[p + 1] * 0.7152 +
      model.pixels[p + 2] * 0.0722;
    const color = [0, 1, 2].map((ch) =>
      Math.round(
        (kind === "eth"
          ? model.pixels[p + ch]
          : lum * (base[ch] * (1 - lm) + land[ch] * lm) * (1 - bm) +
            model.pixels[p + ch] * bm) * light,
      ),
    );
    ctx.strokeStyle = `rgba(${color.join(",")},.52)`;
    ctx.lineWidth = 0.42;
    ctx.beginPath();
    ctx.moveTo(128 + R * rx * r, 128 - R * y * r * 1.015);
    ctx.quadraticCurveTo(
      128 + R * (rx * (r + length) + bend),
      128 - R * y * (r + length) * 1.015,
      128 + R * (rx * (r + length * 0.6) + bend),
      128 - R * y * (r + length * 0.6) * 1.015,
    );
    ctx.stroke();
  }
}
export function renderPlush(
  canvas: HTMLCanvasElement,
  kind: GlobeKind,
  angle: number,
  number?: number | string,
) {
  const ctx = canvas.getContext("2d")!,
    print = ink(number);
  if (gpu?.draw(kind, angle, print)) {
    ctx.drawImage(gpu.canvas, 0, 0);
    canvas.dataset.renderer = "mesh-webgl";
  } else {
    software(ctx, kind, angle, print);
    canvas.dataset.renderer = "mesh-canvas";
  }
  fibres(ctx, kind, angle);
}
