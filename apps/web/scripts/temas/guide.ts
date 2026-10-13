/**
 * Data for the home page guide (temas/guia.json): how big the ecosystem is, a fact for each starting
 * question and what is new. Also the search index of every page (data/search.json), built from the page
 * registry in scripts/paginas.ts. Everything is read from what build-data already wrote.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type {
  AgencySummary,
  DataIndex,
  DeudaTema,
  FuncionariosTema,
  GobiernoOverview,
  HomeGuide,
  LeyResumen,
  MunicipioPagina,
  NoPublicado,
  OrganismoResumen,
  ProveedorResumen,
  SearchEntry,
  SenalesTema,
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
    news.push({
      date: day,
      kind: "Boletín",
      title: `${n} ${n === 1 ? "designación o baja de personal" : "designaciones y bajas de personal"} en el Boletín Oficial`,
      href: "/gobierno",
    });
  if (debt)
    news.push({
      date: debt.corte,
      kind: "Deuda",
      title: `La deuda de Mendoza al ${shortDate(debt.corte)}: US$ ${nf1.format(debt.totalUsd)} millones`,
      href: "/deuda",
    });
  if (lastQuarter)
    news.push({
      date: lastQuarter.date,
      kind: "Personal",
      title: `Cargos de planta del Estado provincial: ${nf.format(lastQuarter.staff)}`,
      href: "/gobierno",
    });
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
      latestLaw: latestLaw
        ? `La última: Ley ${nf.format(Number(latestLaw.numero))}, ${latestLaw.titulo.charAt(0).toLowerCase()}${latestLaw.titulo.slice(1)}`
        : null,
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

const unescapeHtml = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const short = (s: string) => (s.length > 140 ? `${s.slice(0, 139).replace(/\s+\S*$/, "")}…` : s);

/** "I F E L S R L" → "IFELSRL": some supplier names come letter by letter from the source. */
const tidyName = (n: string) =>
  n
    .replace(/\b(?:\p{L} ){2,}\p{L}\b/gu, (m) => m.replace(/ /g, ""))
    .replace(/\s+/g, " ")
    .trim();
const amount = (v: number) =>
  v >= 1e9 ? `$ ${nf1.format(v / 1e9)} mil M` : v >= 1e6 ? `$ ${nf1.format(v / 1e6)} M` : `$ ${nf.format(Math.round(v))}`;
const plural = (n: number, one: string, many: string) => `${nf.format(n)} ${n === 1 ? one : many}`;

/** Where an official sits, without the gendered "Senador/a": the chamber or the office. */
function officialPlace(o: FuncionariosTema["personas"][number]): string {
  switch (o.grupo) {
    case "intendentes":
      return `Intendente de ${o.organismo}`;
    case "diputados_provincial":
      return "Diputados de Mendoza";
    case "senado_provincial":
      return "Senado de Mendoza";
    case "diputados_nacional":
      return "Diputados de la Nación";
    case "senado_nacional":
      return "Senado de la Nación";
    default:
      return o.cargo.replace(/\s*\(.*\)$/, "");
  }
}

/**
 * Search index: a short name and one line with what matters for each kind (no repeated text), plus hidden
 * text to match against (party, CUIT, description). Covers every page and the suppliers without a page of
 * their own (the app still shows them at /proveedores/<slug>).
 */
export function writeSearchIndex(paginas: Pagina[], outDir: string) {
  const read = <T>(file: string, fallback: T): T => {
    try {
      return JSON.parse(readFileSync(join(outDir, file), "utf8")) as T;
    } catch {
      return fallback;
    }
  };
  const officials = read<FuncionariosTema>("temas/funcionarios.json", { personas: [] }).personas;
  const municipalities = read<MunicipioPagina[]>("temas/municipios.json", []);
  const laws = read<LeyResumen[]>("temas/leyes.json", []);
  const suppliers = read<ProveedorResumen[]>("temas/proveedores.json", []);
  const buyers = read<OrganismoResumen[]>("temas/organismos.json", []);
  const agencies = read<AgencySummary[]>("temas/gobierno.json", []);
  const index = read<DataIndex>("index.json", { generatedAt: "", sources: [], datasets: [] });
  const signals = read<SenalesTema>("temas/senales.json", { senales: [] } as unknown as SenalesTema).senales;
  const missing = read<NoPublicado[]>("temas/no-publicado.json", []);

  const byPath = new Map<string, Omit<SearchEntry, "p" | "k">>();
  for (const o of officials) {
    const party = o.partido ?? o.bloque;
    byPath.set(`/funcionarios/${o.role}/${o.slug}`, {
      t: o.nombre,
      s: [officialPlace(o), party, o.mandatoHasta && `hasta ${o.mandatoHasta}`].filter(Boolean).join(" · "),
      i: o.foto ?? undefined,
      q: [o.cargo, o.organismo, o.seccion, ...o.municipalities.map((m) => m.name)].filter(Boolean).join(" "),
    });
  }
  for (const m of municipalities)
    byPath.set(`/municipios/${m.slug}`, {
      t: m.nombre,
      s: [m.intendente && `Intendente: ${m.intendente.nombre}`, `${nf.format(m.poblacion.actual)} habitantes`].filter(Boolean).join(" · "),
      i: m.intendente?.foto ?? undefined,
      q: `departamento municipio ${m.seccion ?? ""} seccion`,
    });
  for (const l of laws)
    byPath.set(`/leyes/${l.numero}`, { t: `Ley ${nf.format(Number(l.numero))}`, s: l.titulo, q: `${l.numero} ${l.tema ?? ""}` });
  for (const p of suppliers)
    byPath.set(`/proveedores/${p.slug}`, {
      t: tidyName(p.nombre),
      s: `${amount(p.total)} en ${plural(p.procesos, "proceso", "procesos")} con el Estado`,
      q: `${p.cuit} ${p.localidad ?? ""} ${p.actividad ?? ""}`,
    });
  for (const b of buyers)
    byPath.set(`/organismos/${b.slug}`, {
      t: b.nombre,
      s: `Compró ${amount(b.total)} en ${plural(b.procesos, "proceso", "procesos")}`,
      q: "compras",
    });
  for (const a of agencies)
    byPath.set(`/gobierno/${a.slug}`, {
      t: a.name,
      s: [a.head && `${a.head.name}, ${a.head.role.toLowerCase()}`, a.staff && `${nf.format(a.staff)} cargos`].filter(Boolean).join(" · "),
      i: a.head?.photo ?? undefined,
      q: "organismo ministerio gobierno personal",
    });
  for (const src of index.sources)
    byPath.set(`/datos/${src.id}`, { t: src.nombre, s: `Datos abiertos de ${src.organismo}`, q: src.descripcion });

  const entries: SearchEntry[] = paginas.map((p) => {
    const known = byPath.get(p.path);
    const k = KIND_BY_PREFIX.find(([re]) => re.test(p.path))?.[1] ?? "Sección";
    if (known) return { p: p.path, k, ...known, q: `${known.q ?? ""} ${p.description}`.trim() };
    // Sections and role pages: their heading and the first sentence of their description.
    return {
      p: p.path,
      k,
      t: unescapeHtml(/<h1>(.*?)<\/h1>/.exec(p.html)?.[1] ?? p.title.replace(/ · Mendoza Transparente$/, "")),
      s: short(p.description.split(/(?<=\.)\s/)[0]!),
      q: p.description,
    };
  });
  // Items that open in a sheet over their page: each one has its own URL, so it can be found and shared.
  for (const s of signals)
    entries.push({
      p: `/senales?senal=${s.id}`,
      k: "Señal",
      t: `${s.cifra} ${s.titulo}`,
      s: `Para mirar de cerca · ${s.tema}`,
      q: `${s.matiz} ${s.casosTitulo}`,
    });
  for (const m of missing)
    entries.push({ p: `/no-publicado?dato=${m.id}`, k: "No se publica", t: m.titulo, s: m.organismo, q: `${m.que_es} ${m.categoria}` });
  const paths = new Set(entries.map((e) => e.p));
  for (const [path, e] of byPath) if (path.startsWith("/proveedores/") && !paths.has(path)) entries.push({ p: path, k: "Proveedor", ...e });
  writeFileSync(join(outDir, "search.json"), JSON.stringify(entries));
  return entries.length;
}
