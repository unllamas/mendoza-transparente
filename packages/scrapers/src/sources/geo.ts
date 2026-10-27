/**
 * Mapa SVG de los 18 departamentos de Mendoza.
 *
 * Fuente: IGN (Instituto Geográfico Nacional), WFS capa `ign:departamento`, filtrada por
 * código INDEC de provincia (in1 LIKE '50%').
 *
 * Salidas (data/processed/geo/):
 *  - mendoza_departamentos.json: { viewBox, fuente, proyeccion, departamentos: [{ municipio, path, centroide }] }
 *  - preview.svg: SVG estático con los 18 paths y etiquetas, para verificar a ojo.
 *
 * Proceso: proyección equirectangular (x escalado por cos de la latitud media, y invertido) a un
 * viewBox de ancho 1000; simplificación Douglas-Peucker preservando las fronteras compartidas
 * (los tramos comunes a dos departamentos se simplifican una sola vez, así no hay huecos ni
 * solapamientos); la tolerancia se elige sola para que el JSON pese menos de MAX_BYTES.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { archive, get, latestRaw, MUNICIPIOS, normalizeMunicipio, PROCESSED_DIR, readRaw } from "@mt/core";

const SOURCE = "geo";
const WFS = "https://wms.ign.gob.ar/geoserver/ows";
const PARAMS: Record<string, string> = {
  service: "WFS",
  version: "2.0.0",
  request: "GetFeature",
  typeNames: "ign:departamento",
  outputFormat: "application/json",
  cql_filter: "in1 LIKE '50%'",
};
const URL_FUENTE = `${WFS}?${new URLSearchParams(PARAMS)}`;

const WIDTH = 1000;
const MAX_BYTES = 58_000;
const MIN_AREA = 0.5; // unidades SVG²: islas más chicas se descartan (salvo la mayor de cada depto)

type Pt = [number, number];
type Ring = Pt[]; // cerrado: primer punto == último
type Poly = Ring[]; // [exterior, ...agujeros]

interface Feature {
  properties: { nam: string };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
}

const key = (p: Pt) => `${p[0]},${p[1]}`;

function dpSimplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a]!;
    const dx = pts[b]![0] - ax;
    const dy = pts[b]![1] - ay;
    const len = Math.hypot(dx, dy);
    let max = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i]!;
      const d = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dx * (ay - py) - (ax - px) * dy) / len;
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (idx >= 0 && max > tol) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Simplifica un tramo en orientación canónica, para que los dos vecinos obtengan lo mismo. */
function simplifySegment(seg: Pt[], tol: number): Pt[] {
  const flip = key(seg[0]!) > key(seg[seg.length - 1]!);
  const out = dpSimplify(flip ? [...seg].reverse() : seg, tol);
  return flip ? out.reverse() : out;
}

function ringArea(r: Ring): number {
  let s = 0;
  for (let i = 0; i < r.length - 1; i++) s += r[i]![0] * r[i + 1]![1] - r[i + 1]![0] * r[i]![1];
  return s / 2;
}

interface Topo {
  nombre: string;
  polys: Poly[];
}

/** Simplifica todos los departamentos manteniendo las fronteras compartidas idénticas. */
function simplifyAll(deptos: Topo[], tol: number): Topo[] {
  // Dueños de cada vértice: qué departamentos lo contienen.
  const owners = new Map<string, Set<string>>();
  for (const d of deptos)
    for (const poly of d.polys)
      for (const ring of poly)
        for (const p of ring) {
          const k = key(p);
          let s = owners.get(k);
          if (!s) owners.set(k, (s = new Set()));
          s.add(d.nombre);
        }
  const sig = (p: Pt) => [...owners.get(key(p))!].sort().join("|");

  const simplifyRing = (ring: Ring): Ring => {
    const pts = ring.slice(0, -1);
    const n = pts.length;
    if (n < 4) return ring;
    const sigs = pts.map(sig);
    let anchors: number[] = [];
    for (let i = 0; i < n; i++) if (sigs[(i + n - 1) % n] !== sigs[i] || sigs[i] !== sigs[(i + 1) % n]) anchors.push(i);
    if (anchors.length < 2) {
      // Anillo sin cambios de vecino: anclas deterministas (menor clave y su punto más lejano).
      let a = 0;
      for (let i = 1; i < n; i++) if (key(pts[i]!) < key(pts[a]!)) a = i;
      let b = a;
      let best = -1;
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(pts[i]![0] - pts[a]![0], pts[i]![1] - pts[a]![1]);
        if (d > best || (d === best && key(pts[i]!) < key(pts[b]!))) {
          best = d;
          b = i;
        }
      }
      anchors = [a, b].sort((x, y) => x - y);
    }
    const out: Pt[] = [];
    for (let k = 0; k < anchors.length; k++) {
      const from = anchors[k]!;
      const to = anchors[(k + 1) % anchors.length]!;
      const seg: Pt[] = [];
      for (let i = from; ; i = (i + 1) % n) {
        seg.push(pts[i]!);
        if (i === to && seg.length > 1) break;
      }
      out.push(...simplifySegment(seg, tol).slice(0, -1));
    }
    out.push(out[0]!);
    return out;
  };

  return deptos.map((d) => {
    const polys: Poly[] = [];
    for (const poly of d.polys) {
      const rings = poly.map(simplifyRing).filter((r) => r.length >= 4);
      if (rings.length) polys.push([rings[0]!, ...rings.slice(1).filter((r) => Math.abs(ringArea(r)) >= MIN_AREA)]);
    }
    return { nombre: d.nombre, polys };
  });
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => String(r1(n)).replace(/^(-?)0\./, "$1.");

/** Redondea a 1 decimal, descarta puntos repetidos y descarta islas diminutas. */
function roundPolys(polys: Poly[]): Poly[] {
  const rounded: Poly[] = [];
  for (const poly of polys) {
    const rings = poly.map((ring) => {
      const out: Ring = [];
      for (const p of ring) {
        const q: Pt = [r1(p[0]), r1(p[1])];
        const last = out[out.length - 1];
        if (!last || last[0] !== q[0] || last[1] !== q[1]) out.push(q);
      }
      return out;
    });
    const valid = rings.filter((r) => r.length >= 4);
    if (valid.length) rounded.push(valid);
  }
  const big = rounded.filter((p) => Math.abs(ringArea(p[0]!)) >= MIN_AREA);
  if (big.length) return big;
  return rounded.sort((a, b) => Math.abs(ringArea(b[0]!)) - Math.abs(ringArea(a[0]!))).slice(0, 1);
}

function toPath(polys: Poly[]): string {
  let d = "";
  for (const poly of polys)
    for (const ring of poly) {
      const pts = ring.slice(0, -1);
      d += `M${fmt(pts[0]![0])} ${fmt(pts[0]![1])}l`;
      const parts: string[] = [];
      for (let i = 1; i < pts.length; i++) parts.push(`${fmt(pts[i]![0] - pts[i - 1]![0])} ${fmt(pts[i]![1] - pts[i - 1]![1])}`);
      d += `${parts.join(" ").replace(/ -/g, "-")}Z`;
    }
  return d;
}

function inside(poly: Poly, x: number, y: number): boolean {
  let c = false;
  for (const ring of poly)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
  return c;
}

function distToEdges(poly: Poly, x: number, y: number): number {
  let best = Infinity;
  for (const ring of poly)
    for (let i = 0; i < ring.length - 1; i++) {
      const [ax, ay] = ring[i]!;
      const [bx, by] = ring[i + 1]!;
      const dx = bx - ax;
      const dy = by - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
      best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
  return best;
}

/** Centroide del polígono mayor; si cae afuera, el punto interior más alejado del borde. */
function centroide(polys: Poly[]): Pt {
  const main = polys.reduce((a, b) => (Math.abs(ringArea(b[0]!)) > Math.abs(ringArea(a[0]!)) ? b : a));
  const ring = main[0]!;
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const f = ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1];
    a += f;
    cx += (ring[i]![0] + ring[i + 1]![0]) * f;
    cy += (ring[i]![1] + ring[i + 1]![1]) * f;
  }
  const c: Pt = [cx / (3 * a), cy / (3 * a)];
  if (inside(main, c[0], c[1])) return [r1(c[0]), r1(c[1])];
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let best: Pt = ring[0]!;
  let bestD = -1;
  for (let i = 0; i <= 40; i++)
    for (let j = 0; j <= 40; j++) {
      const x = x0 + ((x1 - x0) * i) / 40;
      const y = y0 + ((y1 - y0) * j) / 40;
      if (!inside(main, x, y)) continue;
      const d = distToEdges(main, x, y);
      if (d > bestD) {
        bestD = d;
        best = [x, y];
      }
    }
  return [r1(best[0]), r1(best[1])];
}

export async function run(args: string[]) {
  let text: string;
  // --archivado rebuilds the map from the last archived GeoJSON, without asking the IGN (whose certificate can expire).
  const archived = args.includes("--archivado") ? await latestRaw(SOURCE, "ign_departamentos_mendoza.geojson") : null;
  if (archived) {
    console.log(`Usando la copia archivada: ${archived}`);
    text = (await readRaw(archived)).toString("utf8");
  } else {
    console.log("Descargando límites departamentales de Mendoza (IGN WFS)...");
    const resp = await get(URL_FUENTE);
    text = await resp.text();
    const saved = await archive(SOURCE, "ign_departamentos_mendoza.geojson", text, { url: URL_FUENTE });
    console.log(saved ? `Archivado: ${saved}` : "Sin cambios respecto de la última descarga.");
  }

  const features = (JSON.parse(text) as { features: Feature[] }).features;

  // Proyección equirectangular con corrección cos(latitud media).
  let minLon = Infinity,
    maxLon = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  const eachPt = (cb: (p: number[]) => void) => {
    for (const f of features) {
      const polys = (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) as number[][][][];
      for (const poly of polys) for (const ring of poly) for (const p of ring) cb(p);
    }
  };
  eachPt((p) => {
    minLon = Math.min(minLon, p[0]!);
    maxLon = Math.max(maxLon, p[0]!);
    minLat = Math.min(minLat, p[1]!);
    maxLat = Math.max(maxLat, p[1]!);
  });
  const cosLat = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const scale = WIDTH / ((maxLon - minLon) * cosLat);
  const height = Math.round((maxLat - minLat) * scale);
  const project = (p: number[]): Pt => [(p[0]! - minLon) * cosLat * scale, (maxLat - p[1]!) * scale];

  const deptos: Topo[] = [];
  for (const f of features) {
    const nombre = normalizeMunicipio(f.properties.nam);
    if (!nombre) throw new Error(`Departamento no reconocido: ${f.properties.nam}`);
    const polys = (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) as number[][][][];
    deptos.push({ nombre, polys: polys.map((poly) => poly.map((ring) => ring.map(project))) });
  }
  if (deptos.length !== 18 || new Set(deptos.map((d) => d.nombre)).size !== 18)
    throw new Error(`Se esperaban 18 departamentos distintos, hay ${deptos.length}`);

  const build = (tol: number) => {
    const simp = simplifyAll(deptos, tol).map((d) => ({ nombre: d.nombre, polys: roundPolys(d.polys) }));
    const departamentos = MUNICIPIOS.map((m) => {
      const d = simp.find((x) => x.nombre === m)!;
      return { municipio: m, path: toPath(d.polys), centroide: centroide(d.polys) };
    });
    // The projection, so the web can place a GPS point on the map: x = (lon - minLon) * cosLat * scale,
    // y = (maxLat - lat) * scale (the person's location is matched in the browser and never sent anywhere).
    const proyeccion = { minLon, maxLat, cosLat, scale };
    const json = JSON.stringify({ viewBox: `0 0 ${WIDTH} ${height}`, fuente: URL_FUENTE, proyeccion, departamentos });
    return { json, departamentos };
  };

  // Menor tolerancia (en unidades SVG) cuyo JSON entre en MAX_BYTES.
  let lo = 0.05;
  let hi = 5;
  let best = build(hi);
  let tol = hi;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    const b = build(mid);
    if (Buffer.byteLength(b.json) <= MAX_BYTES) {
      best = b;
      tol = mid;
      hi = mid;
    } else lo = mid;
  }
  const bytes = Buffer.byteLength(best.json);
  console.log(
    `Tolerancia ${tol.toFixed(3)} unidades SVG (≈ ${((tol / scale) * 111).toFixed(2)} km); JSON de ${(bytes / 1024).toFixed(1)} KB`,
  );

  const dir = join(PROCESSED_DIR, SOURCE);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "mendoza_departamentos.json"), `${best.json}\n`);

  const colors = ["#dbeafe", "#fde68a", "#bbf7d0", "#fecaca", "#e9d5ff", "#fed7aa"];
  const body = best.departamentos
    .map(
      (d, i) =>
        `<path d="${d.path}" fill="${colors[i % colors.length]}" stroke="#334155" stroke-width="0.8" stroke-linejoin="round"><title>${d.municipio}</title></path>`,
    )
    .join("\n");
  const labels = best.departamentos
    .map(
      (d) =>
        `<text x="${d.centroide[0]}" y="${d.centroide[1]}" font-size="14" font-family="sans-serif" text-anchor="middle" fill="#0f172a">${d.municipio}</text>`,
    )
    .join("\n");
  await writeFile(
    join(dir, "preview.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}">\n<rect width="100%" height="100%" fill="#fff"/>\n${body}\n${labels}\n</svg>\n`,
  );
  console.log(`Escrito ${join(dir, "mendoza_departamentos.json")} y preview.svg`);
}
