/**
 * Procedure pages (docs/procesos/tramites-y-tributos.md#páginas): "Abrir un comercio" for the whole province
 * (temas/tramites/abrir-un-comercio.json), the same procedure in each municipality
 * (temas/municipios/<slug>/tramite-abrir-un-comercio.json) and the trade fee by activity of the municipalities
 * whose tarifaria annex is read (temas/municipios/<slug>/tasas.json).
 *
 * Everything comes from data/curado/tramites.yaml, data/curado/rubros.yaml and data/processed/tributos: nothing is
 * typed here. What an organism does not publish travels as `notPublished` and is shown as "<organismo> no publica…".
 */

import { slug } from "../../src/slug.ts";
import type {
  FeeRow,
  MunicipalFees,
  MunicipalProcedure,
  NotPublished,
  OnlineStatus,
  ProcedureCost,
  ProcedureFee,
  ProcedureGuide,
  ProcedureStep,
} from "../../src/types.ts";

type Raw = Record<string, unknown>;
type CsvRow = Record<string, string>;

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v)).trim();
const num = (v: unknown) => {
  const n = Number(v);
  return v === undefined || v === null || v === "" || !Number.isFinite(n) ? undefined : n;
};
const day = (v: unknown) => str(v).slice(0, 10);
const list = (v: unknown) => (Array.isArray(v) ? (v as Raw[]) : []);

export const PROCEDURE_ID = "abrir-un-comercio";

function step(s: Raw, verified: string): ProcedureStep {
  return {
    level: str(s.nivel) as ProcedureStep["level"],
    agency: str(s.organismo),
    title: str(s.titulo),
    detail: str(s.detalle),
    href: str(s.url),
    when: str(s.cuando) || "siempre",
    verified,
  };
}

function notPublished(n: Raw): NotPublished {
  return { agency: str(n.organismo), what: str(n.que), ...(str(n.detalle) ? { detail: str(n.detalle) } : {}) };
}

/** Whether the municipal step "Habilitación" can be started online, as its own sheet says. */
function onlineStatus(flow: Raw): { status: OnlineStatus; note: string } {
  const unpublished = list(flow.no_publica).find((n) => /l[ií]nea/i.test(str(n.que)));
  if (unpublished) return { status: "not_published", note: str(unpublished.que) };
  const licensing = list(flow.pasos).find((s) => s.nivel === "municipio" && /Habilitaci/i.test(str(s.titulo)));
  const detail = str(licensing?.detalle);
  if (/en l[ií]nea|Ciudadan[ií]a Digital|digital/i.test(detail)) return { status: "online", note: detail };
  if (/presencial|en persona|con turno|Ventanilla|Mesa/i.test(detail)) return { status: "in_person", note: detail };
  return { status: "unknown", note: detail };
}

/** Common activities (data/curado/rubros.yaml) by id, to name the ones a flow only references. */
const commonNames = (common: Raw[]) => new Map(common.map((r) => [str(r.id), str(r.nombre)]));

function feeOf(flow: Raw, table: CsvRow[], names: Map<string, string>): ProcedureFee {
  const t = (flow.tasa_comercio ?? {}) as Raw;
  const year = num(t.ejercicio) ?? num(table[0]?.ejercicio) ?? null;
  const examples = list(t.manual).map((m) => ({
    name: names.get(str(m.rubro)) ?? str(m.rubro),
    min: num(m.min) ?? 0,
    max: num(m.max) ?? 0,
    ...(num(m.pagina) !== undefined ? { page: num(m.pagina) } : {}),
  }));
  return {
    available: t.disponible !== false,
    table: table.length > 0,
    period: str(t.periodo),
    unit: str(t.unidad) || "pesos",
    year,
    ...(num(t.valor_unidad) !== undefined ? { unitValue: num(t.valor_unidad) } : {}),
    ...(str(t.norma_unidad) ? { unitRule: str(t.norma_unidad) } : {}),
    rule: str(t.norma),
    href: str(t.url),
    ...(str(t.nota) ? { note: str(t.nota) } : {}),
    examples,
  };
}

export interface ProceduresOutput {
  guide: ProcedureGuide;
  /** One per municipality with a flow. */
  procedures: MunicipalProcedure[];
  /** One per municipality whose tarifaria annex is read. */
  fees: MunicipalFees[];
}

export function buildProcedures(catalog: Raw[], fees: CsvRow[], documents: CsvRow[], common: Raw[]): ProceduresOutput {
  const flows = catalog.filter((f) => f.id === PROCEDURE_ID);
  const names = commonNames(common);
  const verifiedAll = flows.map((f) => day(f.verificado)).sort();

  // National and provincial steps are the same in every flow: the first one's are shown, dated with the latest check.
  const latest = verifiedAll.at(-1) ?? "";
  const shared = (level: ProcedureStep["level"]) => {
    const seen = new Set<string>();
    return flows
      .flatMap((f) => list(f.pasos).filter((s) => s.nivel === level))
      .filter((s) => !seen.has(str(s.titulo)) && seen.add(str(s.titulo)))
      .map((s) => step(s, latest));
  };
  const provinceAgencies = new Set(
    flows.flatMap((f) =>
      list(f.pasos)
        .filter((s) => s.nivel !== "municipio")
        .map((s) => str(s.organismo)),
    ),
  );
  const isProvincial = (n: Raw) => provinceAgencies.has(str(n.organismo));
  const seenMissing = new Set<string>();
  const provinceNotPublished = flows
    .flatMap((f) => list(f.no_publica).filter(isProvincial))
    .filter((n) => !seenMissing.has(str(n.que)) && seenMissing.add(str(n.que)))
    .map(notPublished);

  const procedures: MunicipalProcedure[] = [];
  const feePages: MunicipalFees[] = [];
  const rows = (name: string) => fees.filter((r) => r.jurisdiccion === name);

  for (const flow of flows) {
    const name = str(flow.municipio);
    const verified = day(flow.verificado);
    const table = rows(name);
    const fee = feeOf(flow, table, names);
    const own = list(flow.pasos)
      .filter((s) => s.nivel === "municipio")
      .map((s) => step(s, verified));
    procedures.push({
      slug: slug(name),
      name,
      verified,
      steps: own,
      costs: list(flow.costos).map(
        (c): ProcedureCost => ({
          concept: str(c.concepto),
          detail: str(c.detalle),
          ...(str(c.norma) ? { rule: str(c.norma) } : {}),
          ...(str(c.url) ? { href: str(c.url) } : {}),
        }),
      ),
      fee,
      notPublished: list(flow.no_publica)
        .filter((n) => !isProvincial(n))
        .map(notPublished),
      promotion: flow.promocion
        ? {
            rule: str((flow.promocion as Raw).norma),
            detail: str((flow.promocion as Raw).detalle),
            ...(str((flow.promocion as Raw).url) ? { href: str((flow.promocion as Raw).url) } : {}),
          }
        : null,
    });
    if (table.length > 0) feePages.push(buildFees(flow, name, verified, table, fee, documents, names));
  }

  const guide: ProcedureGuide = {
    id: PROCEDURE_ID,
    title: str(flows[0]?.titulo) || "Abrir un comercio",
    verified: latest,
    national: shared("nacion"),
    province: shared("provincia"),
    provinceNotPublished,
    municipalities: procedures.map((p) => {
      const flow = flows.find((f) => str(f.municipio) === p.name)!;
      const online = onlineStatus(flow);
      return {
        slug: p.slug,
        name: p.name,
        verified: p.verified,
        ownSteps: p.steps.length,
        online: online.status,
        onlineNote: online.note,
        fee: p.fee.table ? "table" : p.fee.available && p.fee.examples.length > 0 ? "examples" : "none",
        feeYear: p.fee.year,
        feeUnit: p.fee.unit,
        hasPromotion: p.promotion !== null,
      };
    }),
  };
  return { guide, procedures, fees: feePages };
}

function buildFees(
  flow: Raw,
  name: string,
  verified: string,
  table: CsvRow[],
  fee: ProcedureFee,
  documents: CsvRow[],
  names: Map<string, string>,
): MunicipalFees {
  const unitValue = fee.unitValue ?? 1;
  const categories: string[] = [];
  const byKey = new Map<string, FeeRow>();
  for (const r of table) {
    if (!categories.includes(r.categoria!)) categories.push(r.categoria!);
    const key = `${r.codigo}|${r.rubro}|${r.tipo_actividad}`;
    let row = byKey.get(key);
    if (!row) {
      row = {
        code: r.codigo!,
        group: r.grupo ?? "",
        name: r.rubro!,
        type: r.tipo_actividad ?? "",
        page: Number(r.pagina) || 0,
        amounts: [],
      };
      byKey.set(key, row);
    }
    row.amounts.push([r.categoria!, Number(r.monto)]);
  }
  const rows = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const range = (row: FeeRow) => {
    const values = row.amounts.map(([, a]) => a * unitValue);
    return { min: Math.min(...values), max: Math.max(...values) };
  };
  // The everyday activities of the catalog, found in the annex by code (and by the name the annex gives them).
  const highlights: MunicipalFees["highlights"] = [];
  for (const r of list(flow.rubros)) {
    const id = str(r.id);
    const match = rows.find(
      (x) => x.code === str(r.codigo) && (!str(r.nombre_ordenanza) || x.name.toLowerCase() === str(r.nombre_ordenanza).toLowerCase()),
    );
    if (match) highlights.push({ name: str(r.nombre) || names.get(id) || match.name, code: match.code, ...range(match) });
  }
  const ordinance = documents.find(
    (d) => d.jurisdiccion === name && d.documento === "ordenanza_tarifaria" && d.ejercicio === table[0]!.ejercicio,
  );
  return {
    slug: slug(name),
    name,
    year: Number(table[0]!.ejercicio),
    verified,
    period: fee.period,
    unit: fee.unit,
    ...(fee.unitValue !== undefined ? { unitValue: fee.unitValue } : {}),
    ...(fee.unitRule ? { unitRule: fee.unitRule } : {}),
    rule: fee.rule,
    href: fee.href,
    ...(fee.note ? { note: fee.note } : {}),
    ordinance: ordinance
      ? { number: ordinance.numero!, bulletinDate: ordinance.fecha_boletin!, href: ordinance.url_norma! }
      : { number: "", bulletinDate: "", href: fee.href },
    categories,
    highlights,
    rows,
  };
}
