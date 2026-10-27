/**
 * What the assistant knows, as plain data: the procedures catalog (data/curado/tramites.yaml) and the trade fee of
 * each activity (data/processed/tributos/rubros_comercio.csv). `buildKnowledge` turns those files into
 * knowledge.json, which travels inside the Pages Function: the agent never reads files or official sites live.
 *
 *   bun run asistente:datos      regenerates src/knowledge.json (a test fails if it is out of date)
 */

import type { Level } from "./types.ts";

export interface FlowStep {
  level: Level;
  agency: string;
  title: string;
  detail: string;
  href: string;
  /** "siempre", or a condition the activity must meet ("alimentos"). */
  when: string;
}

export interface FlowActivity {
  id: string;
  name: string;
  /** Code of the activity in the municipality's tarifaria annex. */
  code: string;
  /** Name of the activity as printed in the annex: some annexes repeat a code for different activities. */
  codeName?: string;
  /**
   * Other activities of the same annex that someone with this one could be, each with its own amount (a kiosk can be
   * QUIOSCO INTERIOR or MAXI KIOSCO). Shown apart, never merged into one range.
   */
  variants: { code: string; name?: string }[];
  food: boolean;
}

/**
 * How the municipality's trade fee is read (catalog `tasa_comercio`). The amounts come from the tarifaria's table
 * (rubros_comercio.csv) or, when the annex is a scan nobody can read automatically, from `manual`, typed from the
 * page it cites. Amounts in tax units are converted to pesos with `unitValue`.
 */
export interface FeeConfig {
  /** False when the published rules do not allow computing an amount (San Rafael): the agent says so. */
  available: boolean;
  /** "mes", "bimestre", "año", or "" if the ordinance does not say. */
  period: string;
  /** "pesos", "UT" or "UTM". */
  unit: string;
  /** Year of the tarifaria, for the amounts typed by hand (`manual`); the table ones carry their own. */
  year?: number;
  unitValue?: number;
  unitRule?: string;
  rule?: string;
  href?: string;
  note?: string;
  manual: { activity: string; min: number; max: number; page?: number }[];
}

export interface Flow {
  id: string;
  title: string;
  municipality: string;
  verified: string;
  activities: FlowActivity[];
  steps: FlowStep[];
  costs: { concept: string; detail: string; rule?: string; href: string }[];
  unpublished: { what: string; agency: string; detail?: string }[];
  promotion?: { rule: string; detail: string; href: string };
  fee?: FeeConfig;
}

export interface FeeTable {
  municipality: string;
  year: number;
  rule: string;
  href: string;
  /** code, activity name as printed, cheapest and most expensive category. */
  rows: [code: string, name: string, min: number, max: number][];
}

/** A common activity (data/curado/rubros.yaml), offered in any municipality. */
export interface CommonActivity {
  id: string;
  name: string;
  food: boolean;
  /** Synonyms: for the search in the web and to find the activity in a tarifaria's annex. */
  words: string[];
}

export interface Knowledge {
  flows: Flow[];
  fees: FeeTable[];
  activities: CommonActivity[];
}

type Raw = Record<string, unknown>;
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

function feeConfig(t: Raw): FeeConfig {
  const num = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : Number(v));
  return {
    available: t.disponible !== false,
    period: str(t.periodo),
    unit: str(t.unidad) || "pesos",
    ...(num(t.ejercicio) !== undefined ? { year: num(t.ejercicio) } : {}),
    ...(num(t.valor_unidad) !== undefined ? { unitValue: num(t.valor_unidad) } : {}),
    ...(t.norma_unidad ? { unitRule: str(t.norma_unidad) } : {}),
    ...(t.norma ? { rule: str(t.norma) } : {}),
    ...(t.url ? { href: str(t.url) } : {}),
    ...(t.nota ? { note: str(t.nota) } : {}),
    manual: ((t.manual as Raw[]) ?? []).map((m) => ({
      activity: str(m.rubro),
      min: Number(m.min),
      max: Number(m.max),
      ...(m.pagina ? { page: Number(m.pagina) } : {}),
    })),
  };
}

/** Pure: from the parsed YAML catalog and the fee rows to the knowledge the agent ships with. */
export function buildKnowledge(catalog: Raw[], feeRows: Raw[], documents: Raw[], common: Raw[] = []): Knowledge {
  // A flow's activity can be just an id and a code: name and food come from the common list (rubros.yaml).
  const commonById = new Map(common.map((a) => [str(a.id), a]));
  const flows: Flow[] = catalog.map((f) => ({
    id: str(f.id),
    title: str(f.titulo),
    municipality: str(f.municipio),
    verified: str(f.verificado),
    activities: ((f.rubros as Raw[]) ?? []).map((r) => {
      const c = commonById.get(str(r.id));
      return {
        id: str(r.id),
        name: str(r.nombre ?? c?.nombre),
        code: str(r.codigo),
        ...(r.nombre_ordenanza ? { codeName: str(r.nombre_ordenanza) } : {}),
        variants: ((r.variantes as Raw[]) ?? []).map((v) => ({
          code: str(v.codigo),
          ...(v.nombre_ordenanza ? { name: str(v.nombre_ordenanza) } : {}),
        })),
        food: (r.alimentos ?? c?.alimentos) === true,
      };
    }),
    steps: ((f.pasos as Raw[]) ?? []).map((p) => ({
      level: str(p.nivel) as Level,
      agency: str(p.organismo),
      title: str(p.titulo),
      detail: str(p.detalle),
      href: str(p.url),
      when: str(p.cuando) || "siempre",
    })),
    costs: ((f.costos as Raw[]) ?? []).map((c) => ({
      concept: str(c.concepto),
      detail: str(c.detalle),
      ...(c.norma ? { rule: str(c.norma) } : {}),
      href: str(c.url),
    })),
    unpublished: ((f.no_publica as Raw[]) ?? []).map((u) => ({
      what: str(u.que),
      agency: str(u.organismo),
      ...(u.detalle ? { detail: str(u.detalle) } : {}),
    })),
    ...(f.tasa_comercio ? { fee: feeConfig(f.tasa_comercio as Raw) } : {}),
    ...(f.promocion
      ? {
          promotion: {
            rule: str((f.promocion as Raw).norma),
            detail: str((f.promocion as Raw).detalle),
            href: str((f.promocion as Raw).url),
          },
        }
      : {}),
  }));

  const byTable = new Map<string, FeeTable>();
  const ranges = new Map<string, { name: string; amounts: number[] }>();
  for (const r of feeRows) {
    const key = `${str(r.jurisdiccion)}|${str(r.ejercicio)}|${str(r.norma_id)}`;
    if (!byTable.has(key)) {
      const doc = documents.find((d) => str(d.norma_id) === str(r.norma_id));
      byTable.set(key, {
        municipality: str(r.jurisdiccion),
        year: Number(r.ejercicio),
        rule: doc ? `Ordenanza tarifaria ${str(doc.numero)} (${str(r.ejercicio)}), Anexo A` : "Ordenanza tarifaria",
        href: doc ? str(doc.url_norma) : "",
        rows: [],
      });
    }
    // Code and name: some annexes repeat a code for different activities (Guaymallén's 472120).
    const id = `${key}|${str(r.codigo)}|${str(r.rubro)}`;
    const range = ranges.get(id) ?? { name: str(r.rubro), amounts: [] };
    if (Number(r.monto) > 0) range.amounts.push(Number(r.monto));
    ranges.set(id, range);
  }
  for (const [id, { name, amounts }] of ranges) {
    if (!amounts.length) continue;
    const [municipality, year, rule, code] = id.split("|") as [string, string, string, string];
    byTable.get(`${municipality}|${year}|${rule}`)?.rows.push([code, name, Math.min(...amounts), Math.max(...amounts)]);
  }
  const activities: CommonActivity[] = common.map((a) => ({
    id: str(a.id),
    name: str(a.nombre),
    food: a.alimentos === true,
    words: ((a.palabras as unknown[]) ?? []).map(str),
  }));
  return { flows, fees: [...byTable.values()], activities };
}
