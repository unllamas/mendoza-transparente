/**
 * Qué publica cada municipio: el relevamiento a mano de data/curado/transparencia-municipal.yaml,
 * con el anexo de personal que ya bajamos y los índices de data/curado/indices-transparencia.yaml.
 * Criterios (qué cuenta como "al día"): docs/procesos/metodologia.md#transparencia-municipal.
 */

import type {
  ExternalIndexScore,
  MunicipalStaff,
  MunicipalTransparency,
  TransparencyItem,
  TransparencyItemId,
  TransparencyStatus,
} from "../../src/types.ts";

export const TRANSPARENCY_ITEMS: TransparencyItemId[] = [
  "presupuesto",
  "ejecucion",
  "personal",
  "deuda",
  "compras",
  "normas",
  "sueldos",
  "declaraciones_juradas",
  "acceso_informacion",
];

/** One municipality in data/curado/transparencia-municipal.yaml. */
export interface TransparencySurvey {
  municipio: string;
  fecha_verificacion: string;
  sitio?: string | null;
  items: Record<TransparencyItemId, SurveyItem>;
  donde_buscamos?: string[];
  nota?: string | null;
}

interface SurveyItem {
  estado: "publica" | "no_accesible" | "no_publica";
  ultimo_dato?: string | null;
  formato?: TransparencyItem["format"] | "";
  url?: string | null;
  nota?: string | null;
}

/** One index in data/curado/indices-transparencia.yaml. */
export interface ExternalIndex {
  id: string;
  nombre: string;
  organizacion: string;
  url: string;
  metodologia_url?: string | null;
  edicion: string;
  escala: string;
  mide: string;
  resultados: {
    municipio: string;
    puntaje?: number | null;
    puesto_provincia?: number | null;
    puesto_pais?: number | null;
    detalle?: string | null;
    url?: string | null;
  }[];
}

/** What a provincial office publishes for a municipality: how many records and the latest date. */
export interface ProvincialRecord {
  count: number;
  latest: string;
}

const key = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

/** "MUNICIPALIDAD DE LUJAN" → Luján de Cuyo; "MUNICIPALIDAD CIUDAD DE MENDOZA" → Capital. */
function municipalityOf(agency: string, municipalities: string[]): string | null {
  if (!/^municipalidad/i.test(agency)) return null;
  const k = key(agency.replace(/^municipalidad\s+(de\s+)?/i, ""));
  if (k === "ciudaddemendoza") return municipalities.find((m) => m === "Capital") ?? null;
  return municipalities.find((m) => key(m) === k || key(m).startsWith(k)) ?? null;
}

function groupBy(
  rows: Record<string, string>[],
  municipalities: string[],
  agency: (r: Record<string, string>) => string,
  date: (r: Record<string, string>) => string,
  since = "",
): Map<string, ProvincialRecord> {
  const out = new Map<string, ProvincialRecord>();
  for (const r of rows) {
    const m = municipalityOf(agency(r) ?? "", municipalities);
    const d = date(r) ?? "";
    if (!m || !d || d < since) continue;
    const prev = out.get(m) ?? { count: 0, latest: "" };
    out.set(m, { count: prev.count + 1, latest: d > prev.latest ? d : prev.latest });
  }
  return out;
}

/** Officials of each municipality with an asset declaration online (data/processed/etica-publica/funcionarios.csv). */
export const declarationsByMunicipality = (rows: Record<string, string>[], municipalities: string[]) =>
  groupBy(
    rows.filter((r) => Number(r.declaraciones_publicadas) > 0),
    municipalities,
    (r) => r.reparticion!,
    (r) => r.fecha_ultima_declaracion!,
  );

/** Municipal ordinances and decrees in the provincial Official Bulletin over the last year (data/processed/boletin-oficial/normas.csv). */
export const bulletinByMunicipality = (rows: Record<string, string>[], municipalities: string[], since: string) =>
  groupBy(
    rows,
    municipalities,
    (r) => r.organismo!,
    (r) => r.fecha!,
    since,
  );

const ETHICS_URL = "https://eticapublica.mendoza.gov.ar/declaraciones";
const BULLETIN_URL = "https://boe.mendoza.gov.ar/";

const DAY = 86_400_000;
const days = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / DAY;

/**
 * Last quarter whose annexes should already be online: the Fiscal Responsibility Law annexes come out
 * about two months after the quarter closes, so we give 75 days.
 */
function expectedQuarter(checked: string): string {
  const limit = new Date(Date.parse(checked) - 75 * DAY);
  const y = limit.getUTCFullYear();
  const ends = [`${y - 1}-12-31`, `${y}-03-31`, `${y}-06-30`, `${y}-09-30`, `${y}-12-31`];
  return ends.filter((e) => Date.parse(e) <= limit.getTime()).at(-1)!;
}

/** Whether a published item is up to date on the day it was checked. */
function isCurrent(id: TransparencyItemId, latest: string | null | undefined, checked: string): boolean {
  if (id === "acceso_informacion") return true;
  if (!latest) return false;
  const year = Number(checked.slice(0, 4));
  switch (id) {
    case "presupuesto":
      return Number(latest.slice(0, 4)) >= year;
    case "ejecucion":
    case "personal":
    case "deuda":
      return latest >= expectedQuarter(checked);
    case "compras":
    case "normas":
      return days(latest, checked) <= 90;
    case "sueldos":
      return days(latest, checked) <= 120;
    case "declaraciones_juradas":
      return Number(latest.slice(0, 4)) >= year - 1;
  }
}

function toItem(id: TransparencyItemId, s: SurveyItem | undefined, checked: string): TransparencyItem {
  const latest = s?.ultimo_dato ? String(s.ultimo_dato).slice(0, 10) : null;
  const status: TransparencyStatus =
    !s || s.estado === "no_publica"
      ? "missing"
      : s.estado === "no_accesible"
        ? "unreadable"
        : isCurrent(id, latest, checked)
          ? "current"
          : latest
            ? "late"
            : "undated";
  return { id, status, latest, format: s?.formato || null, url: s?.url || null, note: s?.nota || null };
}

function fromProvince(item: TransparencyItem, latest: string, checked: string, url: string, note: string): TransparencyItem {
  return { ...item, status: isCurrent(item.id, latest, checked) ? "current" : "late", latest, url, format: "web", note };
}

export function buildMunicipalTransparency(
  surveys: TransparencySurvey[],
  staff: Map<string, MunicipalStaff>,
  indices: ExternalIndex[],
  declarations: Map<string, ProvincialRecord> = new Map(),
  bulletin: Map<string, ProvincialRecord> = new Map(),
): Map<string, MunicipalTransparency> {
  for (const s of surveys) {
    const missing = TRANSPARENCY_ITEMS.filter((id) => !s.items?.[id]);
    if (missing.length) throw new Error(`transparencia-municipal.yaml: a ${s.municipio} le faltan ${missing.join(", ")}`);
  }
  const built = surveys.map((s) => {
    const checked = String(s.fecha_verificacion).slice(0, 10);
    const items = TRANSPARENCY_ITEMS.map((id) => {
      const item = toItem(id, s.items[id], checked);
      // What we already scrape comes from the data, not from the survey: the staff annex and, since Ley 8993
      // gives them to the provincial Ethics Office, the asset declarations.
      const st = staff.get(s.municipio);
      if (id === "personal" && st) {
        return {
          ...item,
          status: isCurrent("personal", st.cutoff, checked) ? "current" : "late",
          latest: st.cutoff,
          url: st.sourceUrl,
          format: item.format ?? "pdf",
        } satisfies TransparencyItem;
      }
      // Ley 8993 gives asset declarations to the provincial Ethics Office, and ordinances and decrees come out in
      // the provincial Official Bulletin: if the municipality does not have them up to date, those count, with a note.
      const dj = declarations.get(s.municipio);
      if (id === "declaraciones_juradas" && dj && item.status !== "current") {
        return fromProvince(
          item,
          dj.latest,
          checked,
          ETHICS_URL,
          `Las publica la Oficina de Ética Pública de la provincia: ${dj.count} ${dj.count === 1 ? "funcionario" : "funcionarios"} de la municipalidad tienen su declaración en línea.`,
        );
      }
      const bo = bulletin.get(s.municipio);
      if (id === "normas" && bo && item.status !== "current") {
        const own = item.status === "missing" ? "" : " Además tiene su propio digesto o listado.";
        return fromProvince(
          item,
          bo.latest,
          checked,
          BULLETIN_URL,
          `Salen en el Boletín Oficial de la provincia: ${bo.count} ${bo.count === 1 ? "norma" : "normas"} del municipio en el último año.${own}`,
        );
      }
      return item;
    });
    const published = items.filter((i) => i.status === "current" || i.status === "late" || i.status === "undated").length;
    return { s, checked, items, published, current: items.filter((i) => i.status === "current").length };
  });
  const average = built.reduce((sum, b) => sum + b.published, 0) / (built.length || 1);
  return new Map(
    built.map(({ s, checked, items, published, current }) => [
      s.municipio,
      {
        checked,
        site: s.sitio || null,
        items,
        published,
        current,
        rank: built.filter((b) => b.published > published).length + 1,
        average: Math.round(average * 10) / 10,
        searched: s.donde_buscamos ?? [],
        note: s.nota || null,
        indices: indices.flatMap((ix): ExternalIndexScore[] => {
          const r = ix.resultados.find((x) => x.municipio === s.municipio);
          if (!r) return [];
          return [
            {
              id: ix.id,
              name: ix.nombre,
              organization: ix.organizacion,
              edition: String(ix.edicion),
              scale: ix.escala,
              measures: ix.mide,
              score: r.puntaje ?? null,
              provinceRank: r.puesto_provincia ?? null,
              countryRank: r.puesto_pais ?? null,
              detail: r.detalle || null,
              url: r.url || ix.url,
              methodologyUrl: ix.metodologia_url || null,
            },
          ];
        }),
      },
    ]),
  );
}
