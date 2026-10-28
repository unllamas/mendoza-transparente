/**
 * Generates the optimized, transparent PNGs of every mascot from the originals the illustrator delivered. The
 * originals are kept as WebP at 80 % quality (`originales/<pose>.webp`): a few KB each instead of 1.5 MB.
 *
 *   bun run mascotas           builds `apps/web/public/mascotas/<id>/<style>/`
 *   bun run mascotas --check   only verifies that every pose has its original and its generated files
 *
 * Per pose: transparent background (flood fill from the borders, soft edges), crop shared by all the poses of
 * the style (so the mascot keeps its size and its feet when the pose changes), resize with premultiplied alpha
 * and a quantized palette. It is deterministic: running it twice yields the same bytes.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import UPNG from "@pdf-lib/upng";
import sharp from "sharp";
import { checkAssets, OUTPUT_ROOT, SOURCE_ROOT } from "../src/check.ts";
import { AVATAR_SIZES, avatarFile, MASCOTS, poseFile, type StyleManifest } from "../src/manifest.ts";

type Rgba = { w: number; h: number; data: Uint8ClampedArray };

const PALETTE_COLORS = 256;
const MARGIN = 0.03;
/** Smallest opaque island (px, in the 1254 px original) that counts as part of the mascot. */
const MIN_COMPONENT = 3000;

/** Decodes an original (WebP, or any format sharp reads) to RGBA pixels. */
async function decodeOriginal(path: string): Promise<Rgba> {
  const { data, info } = await sharp(readFileSync(path)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength) };
}

function encodePng(img: Rgba): Uint8Array {
  const png = UPNG.encode([img.data.buffer as ArrayBuffer], img.w, img.h, PALETTE_COLORS);
  return new Uint8Array(png);
}

/** Mean color of the four 12 px corners: the flat background of the originals. */
function backgroundColor(img: Rgba): [number, number, number] {
  const sum = [0, 0, 0];
  let n = 0;
  for (const [cx, cy] of [
    [0, 0],
    [img.w - 12, 0],
    [0, img.h - 12],
    [img.w - 12, img.h - 12],
  ] as const) {
    for (let y = cy; y < cy + 12; y++) {
      for (let x = cx; x < cx + 12; x++) {
        const i = (y * img.w + x) * 4;
        sum[0]! += img.data[i]!;
        sum[1]! += img.data[i + 1]!;
        sum[2]! += img.data[i + 2]!;
        n++;
      }
    }
  }
  return [sum[0]! / n, sum[1]! / n, sum[2]! / n];
}

function dist(r: number, g: number, b: number, c: readonly [number, number, number]): number {
  return Math.hypot(r - c[0], g - c[1], b - c[2]);
}

/**
 * Removes the background. The background and its elliptical shadow are cool grays; the cream of the ruff and the
 * white of the wings are warmer or lighter-edged, so a pixel is "background-like" when it is close to the
 * background color and not warmer than it. The flood fill only advances from the borders through such pixels, so
 * the whites inside the silhouette are never touched.
 */
function removeBackground(img: Rgba): void {
  const { w, h, data } = img;
  const bg = backgroundColor(img);
  const bgWarmth = bg[0] - bg[2];
  const bgLike = new Uint8Array(w * h);
  // The originals carry a fine grain: classify on the 3x3 mean so the noise does not break the flood.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
          const i = (yy * w + xx) * 4;
          r += data[i]!;
          g += data[i + 1]!;
          b += data[i + 2]!;
          n++;
        }
      }
      r /= n;
      g /= n;
      b /= n;
      const warmth = r - b;
      if (dist(r, g, b, bg) <= 36 && warmth <= bgWarmth + 2.5 && warmth >= bgWarmth - 8) bgLike[y * w + x] = 1;
    }
  }

  // 4-connected flood fill from every border pixel.
  const flooded = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (p: number) => {
    if (bgLike[p] && !flooded[p]) {
      flooded[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length > 0) {
    const p = stack.pop()!;
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < w * (h - 1)) push(p + w);
  }

  // Grain that survived the flood (isolated specks) is not part of the drawing: drop every opaque island that
  // is not big enough to be the mascot.
  const seen = new Uint8Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (flooded[start] || seen[start]) continue;
    const comp = [start];
    seen[start] = 1;
    for (let k = 0; k < comp.length; k++) {
      const p = comp[k]!;
      const x = p % w;
      const nbs = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p >= w ? p - w : -1, p < w * (h - 1) ? p + w : -1];
      for (const q of nbs) {
        if (q >= 0 && !flooded[q] && !seen[q]) {
          seen[q] = 1;
          comp.push(q);
        }
      }
    }
    if (comp.length < MIN_COMPONENT) for (const p of comp) flooded[p] = 1;
  }

  // Soft edge: opaque pixels that touch the flooded area get a partial alpha from how far they are from the
  // local background, and their color is un-mixed from it (so no light halo remains).
  const R = 3;
  const edge: number[] = [];
  const isEdge = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (flooded[p]) continue;
      let near = false;
      for (let dy = -R; dy <= R && !near; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < w && flooded[yy * w + xx]) {
            near = true;
            break;
          }
        }
      }
      if (near) {
        isEdge[p] = 1;
        edge.push(p);
      }
    }
  }
  const out = new Uint8ClampedArray(data);
  for (let p = 0; p < w * h; p++) if (flooded[p]) out[p * 4 + 3] = 0;
  for (const p of edge) {
    const x = p % w;
    const y = (p - x) / w;
    const local = [0, 0, 0];
    let nb = 0;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
        const q = yy * w + xx;
        if (!flooded[q]) continue;
        local[0]! += data[q * 4]!;
        local[1]! += data[q * 4 + 1]!;
        local[2]! += data[q * 4 + 2]!;
        nb++;
      }
    }
    const bgLocal: [number, number, number] = [local[0]! / nb, local[1]! / nb, local[2]! / nb];
    // Foreground estimate: the opaque pixels 4 to 8 px away that are not part of the edge band.
    const fg = [0, 0, 0];
    let nf = 0;
    for (let dy = -8; dy <= 8; dy++) {
      for (let dx = -8; dx <= 8; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
        const q = yy * w + xx;
        if (flooded[q] || isEdge[q]) continue;
        fg[0]! += data[q * 4]!;
        fg[1]! += data[q * 4 + 1]!;
        fg[2]! += data[q * 4 + 2]!;
        nf++;
      }
    }
    if (nf === 0) continue;
    const fgColor: [number, number, number] = [fg[0]! / nf, fg[1]! / nf, fg[2]! / nf];
    const span = dist(fgColor[0], fgColor[1], fgColor[2], bgLocal);
    // Whites that are almost the background color: keep them opaque, there is nothing to un-mix.
    if (span < 28) continue;
    const i = p * 4;
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    let alpha = Math.min(1, dist(r, g, b, bgLocal) / span);
    if (alpha > 0.92) continue;
    if (alpha < 0.04) alpha = 0;
    out[i + 3] = Math.round(alpha * 255);
    if (alpha > 0) {
      out[i] = bgLocal[0] + (r - bgLocal[0]) / alpha;
      out[i + 1] = bgLocal[1] + (g - bgLocal[1]) / alpha;
      out[i + 2] = bgLocal[2] + (b - bgLocal[2]) / alpha;
    }
  }
  data.set(out);
}

/** Bounding box of the pixels with some opacity. */
function contentBox(img: Rgba): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = img.w;
  let y0 = img.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (img.data[(y * img.w + x) * 4 + 3]! > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/** Square window `[x, x+size) x [y, y+size)` of the image (may overflow it: outside is transparent), resized to `out` px. Area average with premultiplied alpha. */
function cropResize(img: Rgba, x: number, y: number, size: number, out: number): Rgba {
  const dst = new Uint8ClampedArray(out * out * 4);
  const scale = size / out;
  for (let oy = 0; oy < out; oy++) {
    const sy0 = y + oy * scale;
    const sy1 = sy0 + scale;
    for (let ox = 0; ox < out; ox++) {
      const sx0 = x + ox * scale;
      const sx1 = sx0 + scale;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let wsum = 0;
      for (let yy = Math.floor(sy0); yy < Math.ceil(sy1); yy++) {
        const wy = Math.min(yy + 1, sy1) - Math.max(yy, sy0);
        for (let xx = Math.floor(sx0); xx < Math.ceil(sx1); xx++) {
          const wgt = wy * (Math.min(xx + 1, sx1) - Math.max(xx, sx0));
          wsum += wgt;
          if (xx < 0 || yy < 0 || xx >= img.w || yy >= img.h) continue;
          const i = (yy * img.w + xx) * 4;
          const pa = (img.data[i + 3]! / 255) * wgt;
          r += img.data[i]! * pa;
          g += img.data[i + 1]! * pa;
          b += img.data[i + 2]! * pa;
          a += pa;
        }
      }
      const o = (oy * out + ox) * 4;
      if (a > 0) {
        dst[o] = r / a;
        dst[o + 1] = g / a;
        dst[o + 2] = b / a;
      }
      dst[o + 3] = Math.round((a / wsum) * 255);
    }
  }
  return { w: out, h: out, data: dst };
}

function writePng(path: string, img: Rgba): number {
  const bytes = encodePng(img);
  writeFileSync(path, bytes);
  return bytes.length;
}

async function buildStyle(mascotId: string, styleId: string, style: StyleManifest): Promise<void> {
  const sourceDir = join(SOURCE_ROOT, mascotId, styleId, "originales");
  const outDir = join(OUTPUT_ROOT, mascotId, styleId);
  mkdirSync(outDir, { recursive: true });

  const poses = new Map<string, Rgba>();
  for (const pose of Object.keys(style.poses)) {
    const img = await decodeOriginal(join(sourceDir, `${pose}.webp`));
    removeBackground(img);
    poses.set(pose, img);
  }

  // One crop for the whole style: the union of the content of every pose, square, with a small margin.
  let u = { x0: Number.POSITIVE_INFINITY, y0: Number.POSITIVE_INFINITY, x1: 0, y1: 0 };
  for (const img of poses.values()) {
    const b = contentBox(img);
    u = { x0: Math.min(u.x0, b.x0), y0: Math.min(u.y0, b.y0), x1: Math.max(u.x1, b.x1), y1: Math.max(u.y1, b.y1) };
  }
  const side = Math.round(Math.max(u.x1 - u.x0, u.y1 - u.y0) * (1 + MARGIN * 2));
  const cx = Math.round((u.x0 + u.x1) / 2 - side / 2);
  const cy = Math.round((u.y0 + u.y1) / 2 - side / 2);

  for (const [pose, img] of poses) {
    const sizes: string[] = [];
    for (const size of style.sizes) {
      const bytes = writePng(join(outDir, poseFile(pose, size)), cropResize(img, cx, cy, side, size));
      sizes.push(`${size}px ${(bytes / 1024).toFixed(1)} KB`);
    }
    console.log(`${mascotId}/${styleId}/${pose}: ${sizes.join(", ")}`);
  }

  const avatarSource = poses.get(style.avatar.pose);
  if (!avatarSource) throw new Error(`${mascotId}/${styleId}: avatar.pose "${style.avatar.pose}" is not a pose`);
  const { x, y, size } = style.avatar.crop;
  const sizes: string[] = [];
  for (const out of AVATAR_SIZES) {
    const bytes = writePng(join(outDir, avatarFile(out)), cropResize(avatarSource, x, y, size, out));
    sizes.push(`${out}px ${(bytes / 1024).toFixed(1)} KB`);
  }
  console.log(`${mascotId}/${styleId}/avatar: ${sizes.join(", ")}`);
}

async function main(): Promise<void> {
  const onlyCheck = process.argv.includes("--check");
  if (!onlyCheck) {
    for (const [id, mascot] of Object.entries(MASCOTS)) {
      for (const [styleId, style] of Object.entries(mascot.styles)) await buildStyle(id, styleId, style as StyleManifest);
    }
  }
  const problems = checkAssets();
  if (problems.length > 0) {
    for (const p of problems) console.error(`✗ ${p}`);
    process.exit(1);
  }
  console.log("Mascotas: todo en orden.");
}

await main();
