/** Shape of the JSON that scripts/build-data.ts writes to public/datos/ and the app reads. */

export type Scrutiny = "provisorio" | "definitivo";

export type VoteType = "blanco" | "nulo" | "recurrido" | "impugnado";

export interface Turnout {
  mesasHabilitadas: number | null;
  mesasEscrutadas: number | null;
  electores: number | null;
  votantes: number | null;
}

export interface ListVotes {
  agrupacion: string;
  lista: string;
  candidato: string;
  votos: number;
}

/** Results of one geographic unit (the province, a department, a circuit, a polling table). */
export interface Unit {
  nombre: string;
  seccion: number | null;
  participacion: Turnout | null;
  /** Positive votes per list, most voted first. */
  listas: ListVotes[];
  otros: Partial<Record<VoteType, number>>;
  /** True when the figures are our sum of finer units, because the source does not print this total. */
  sumado: boolean;
}

export interface OfficeResults {
  provincia: Unit | null;
  secciones: Unit[];
  departamentos: Unit[];
  /** Departments (slugs) with a detail file of circuits or polling tables. */
  detalle: string[];
}

export interface ElectionScrutiny {
  fuente: string;
  fuenteUrl: string;
  cargos: Record<string, OfficeResults>;
}

export interface Election {
  id: string;
  tipo: string;
  escrutinios: Partial<Record<Scrutiny, ElectionScrutiny>>;
  auditoria: AuditCheck[];
  /** Official color of each force (by its name as the source writes it), from data/curado/partidos.yaml. */
  colores: Record<string, string>;
  /**
   * The curated parties behind a force (by its name as the source writes it): one when the force is a party of
   * data/curado/partidos.yaml, several when it is a front of data/curado/frentes.yaml. Missing when nobody curated it.
   */
  partidos: Record<string, PartyRef[]>;
}

/** A curated party of the main site: its page is https://mendoza-transparente.com/partidos/<slug>. */
export interface PartyRef {
  slug: string;
  nombre: string;
  sigla: string | null;
  /** Absolute URL of the official logo, on the main site. */
  logo: string | null;
  /** The party's own color ("#951b81"), from its official logo; paints its mark while it has no logo. */
  color: string | null;
}

/** One automatic check over the official figures (scripts/audit.ts). An alert is a signal to look at, not a verdict. */
export interface AuditCheck {
  id: "sumas" | "provisorio-definitivo" | "participacion" | "mesas-sin-escrutar";
  cargo: string;
  titulo: string;
  descripcion: string;
  /** How many units (departments, polling tables, lists) were compared. */
  revisados: number;
  /** What `revisados` counts, in plural: "departamentos", "mesas". */
  unidad: string;
  alertas: number;
  /** Every case found, alerts included. Only the provisional-to-definitive check finds cases that are not alerts. */
  hallados: number;
  /** The same counts for each department, so a municipal page can show only its own. */
  lugares: Record<string, { revisados: number; alertas: number; hallados: number }>;
  /** The largest cases of each department, alerts first. At most 15 per department. */
  casos: AuditCase[];
}

/** One case found by a check: a figure that changed, or a sentence when there is no pair of figures to compare. */
export interface AuditCase {
  /** Department. */
  lugar: string;
  /** Polling table, when the check goes table by table. */
  mesa?: string;
  /** What is compared: "Lista 506 · LA LIBERTAD AVANZA", "Votos en blanco". */
  que?: string;
  antes?: number;
  despues?: number;
  /** Share of the unit's ballots that the change moves (0.004 is 0,4 %). */
  parte?: number;
  alerta: boolean;
  /** The case in one sentence, without the department. */
  texto: string;
}

export interface MapData {
  viewBox: string;
  fuente: string;
  departamentos: { municipio: string; path: string; centroide: [number, number] }[];
}

export interface ElectionSummary {
  id: string;
  tipo: string;
  escrutinios: Scrutiny[];
  cargos: string[];
}

export interface DataIndex {
  generado: string;
  anios: { anio: number; elecciones: ElectionSummary[] }[];
}

export interface DepartmentDetail {
  circuitos: Unit[];
  mesas: Unit[];
}
