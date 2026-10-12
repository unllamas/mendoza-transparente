/**
 * Data for the home page guide (temas/guia.json): how big the ecosystem is, a fact for each starting
 * question and what is new. Also the search index of every page (data/search.json), built from the page
 * registry in scripts/paginas.ts. Everything is read from what build-data already wrote.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type {
  DataIndex,
  DeudaTema,
  FuncionariosTema,
  GobiernoOverview,
  HomeGuide,
  LeyResumen,
  NoPublicado,
  ProveedorResumen,
  SearchEntry,
} from "../../src/types.ts";
import type { Pagina } from "../paginas.ts";

type Row = Record<string, string>;

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const nf = new Intl.NumberFormat("es-AR");
const nf1 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

export function buildGuide(outDir: string, appointments: Row[]): HomeGuide {
  const read = <T>(file: string, fallback: T): T => {
    try {
      return JSON.parse(readFileSync(join(outDir, file), "utf8")) as T;
    } catch {
      return fallback;
    }
  };
  const index = read<DataIndex>("index.json", { generatedAt: "", sources: [], datasets: [] });
  const officials = read<FuncionariosTema>("temas/funcionarios.json", { personas: [] }).personas;
  const agencies = read<unknown[]>("temas/gobierno.json", []);
  const laws = read<LeyResumen[]>("temas/leyes.json", []);
  const suppliers = read<ProveedorResumen[]>("temas/proveedores.json", []).filter((p) => p.indexable);
  const buyers = read<unknown[]>("temas/organismos.json", []);
  const missing = read<NoPublicado[]>("temas/no-publicado.json", []);
  const debt = read<DeudaTema | null>("temas/deuda.json", null);
  const government = read<GobiernoOverview | null>("temas/gobierno-resumen.json", null);

  const records = index.datasets.reduce((s, d) => s + d.rowCount, 0);
  const latestLaw = [...laws].sort((a, b) => (b.publicada ?? "").localeCompare(a.publicada ?? ""))[0];
  // Only agencies that kept their structure: a restructured ministry's change is not like for like.
  const biggestCut = government?.changes.filter((c) => !c.restructured && c.pct <= -1).sort((a, b) => a.pct - b.pct)[0];
  const lastQuarter = government?.series.at(-1);

  // What is new: dated by the data itself (when a law was published, the date of the debt figure…).
  const news: HomeGuide["news"] = [];
  const recentLaws = [...laws]
    .filter((l) => l.publicada)
    .sort((a, b) => b.publicada!.localeCompare(a.publicada!))
    .slice(0, 4);
  for (const l of recentLaws)
    news.push({ date: l.publicada!, kind: "Ley", title: `Ley ${nf.format(Number(l.numero))}: ${l.titulo}`, href: `/leyes/${l.numero}` });
  const byDay = new Map<string, number>();
  for (const a of appointments) if (a.fecha_boletin) byDay.set(a.fecha_boletin, (byDay.get(a.fecha_boletin) ?? 0) + 1);
  for (const [day, n] of [...byDay].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 2))
    news.push({ date: day, kind: "Boletín", title: `${n} ${n === 1 ? "designación o baja de personal" : "designaciones y bajas de personal"} en el Boletín Oficial`, href: "/gobierno" });
  if (debt)
    news.push({ date: debt.corte, kind: "Deuda", title: `La deuda de Mendoza al ${shortDate(debt.corte)}: US$ ${nf1.format(debt.totalUsd)} millones`, href: "/deuda" });
  if (lastQuarter)
    news.push({ date: lastQuarter.date, kind: "Personal", title: `Cargos de planta del Estado provincial: ${nf.format(lastQuarter.staff)}`, href: "/gobierno" });
  news.sort((a, b) => b.date.localeCompare(a.date));

  return {
    counts: {
      records,
      sources: index.sources.filter((s) => index.datasets.some((d) => d.source === s.id)).length,
      officials: officials.length,
      agencies: agencies.length,
      laws: laws.length,
      suppliers: suppliers.length,
      buyers: buyers.length,
      municipalities: 18,
      missing: missing.length,
      appointments: appointments.length,
    },
    facts: {
      debt: debt ? `US$ ${nf1.format(debt.totalUsd)} millones al ${shortDate(debt.corte)}` : null,
      latestLaw: latestLaw ? `La última: Ley ${nf.format(Number(latestLaw.numero))}, ${latestLaw.titulo.charAt(0).toLowerCase()}${latestLaw.titulo.slice(1)}` : null,
      topSupplier: suppliers[0] ? `${suppliers.length} empresas con todos sus contratos` : null,
      staff: lastQuarter
        ? `${nf.format(lastQuarter.staff)} cargos de planta${biggestCut ? `. Mayor baja desde 2023: ${biggestCut.name} (−${Math.abs(Math.round(biggestCut.pct))} %)` : ""}`
        : null,
    },
    news: news.slice(0, 8),
  };
}

const KIND_BY_PREFIX: [RegExp, string][] = [
  [/^\/funcionarios\/[^/]+\/[^/]+$/, "Funcionario"],
  [/^\/funcionarios\/[^/]+$/, "Cargo"],
  [/^\/municipios\/[^/]+$/, "Municipio"],
  [/^\/leyes\/[^/]+$/, "Ley"],
  [/^\/proveedores\/[^/]+$/, "Proveedor"],
  [/^\/organismos\/[^/]+$/, "Área que compra"],
  [/^\/gobierno\/[^/]+$/, "Organismo"],
  [/^\/datos\/[^/]+$/, "Datos abiertos"],
];

const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const short = (s: string) => (s.length > 140 ? `${s.slice(0, 139).replace(/\s+\S*$/, "")}…` : s);
const pesos = (v: number) => (v >= 1e9 ? `$ ${nf1.format(v / 1e9)} mil millones` : `$ ${nf1.format(v / 1e6)} millones`);

/**
 * Search index: every page (with its full heading, not the 60-character SEO title) plus the suppliers that
 * have no page of their own (the app still shows them at /proveedores/<slug>).
 */
export function writeSearchIndex(paginas: Pagina[], outDir: string) {
  const entries: SearchEntry[] = paginas.map((p) => ({
    p: p.path,
    t: unescape(/<h1>(.*?)<\/h1>/.exec(p.html)?.[1] ?? p.title.replace(/ · Mendoza Transparente$/, "")),
    k: KIND_BY_PREFIX.find(([re]) => re.test(p.path))?.[1] ?? "Sección",
    d: short(p.description),
  }));
  const paths = new Set(entries.map((e) => e.p));
  const suppliers = JSON.parse(readFileSync(join(outDir, "temas", "proveedores.json"), "utf8")) as ProveedorResumen[];
  for (const s of suppliers) {
    const path = `/proveedores/${s.slug}`;
    if (paths.has(path)) continue;
    entries.push({
      p: path,
      t: s.nombre,
      k: "Proveedor",
      d: short(`Proveedor del Estado de Mendoza: ${pesos(s.total)} adjudicados en ${s.procesos} ${s.procesos === 1 ? "proceso" : "procesos"}. CUIT ${s.cuit}.`),
    });
  }
  writeFileSync(join(outDir, "search.json"), JSON.stringify(entries));
  return entries.length;
}
