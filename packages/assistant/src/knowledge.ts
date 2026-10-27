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
  food: boolean;
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
}

export interface FeeTable {
  municipality: string;
  year: number;
  rule: string;
  href: string;
  /** code, activity name as printed, cheapest and most expensive category. */
  rows: [code: string, name: string, min: number, max: number][];
}

export interface Knowledge {
  flows: Flow[];
  fees: FeeTable[];
}

type Raw = Record<string, unknown>;
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/** Pure: from the parsed YAML catalog and the fee rows to the knowledge the agent ships with. */
export function buildKnowledge(catalog: Raw[], feeRows: Raw[], documents: Raw[]): Knowledge {
  const flows: Flow[] = catalog.map((f) => ({
    id: str(f.id),
    title: str(f.titulo),
    municipality: str(f.municipio),
    verified: str(f.verificado),
    activities: ((f.rubros as Raw[]) ?? []).map((r) => ({
      id: str(r.id),
      name: str(r.nombre),
      code: str(r.codigo),
      food: r.alimentos === true,
    })),
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
    const id = `${key}|${str(r.codigo)}`;
    const range = ranges.get(id) ?? { name: str(r.rubro), amounts: [] };
    range.amounts.push(Number(r.monto));
    ranges.set(id, range);
  }
  for (const [id, { name, amounts }] of ranges) {
    const [municipality, year, rule, code] = id.split("|") as [string, string, string, string];
    byTable.get(`${municipality}|${year}|${rule}`)?.rows.push([code, name, Math.min(...amounts), Math.max(...amounts)]);
  }
  return { flows, fees: [...byTable.values()] };
}
