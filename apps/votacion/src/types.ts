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
  /** The largest cases, already written as a sentence. At most 30. */
  casos: string[];
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
