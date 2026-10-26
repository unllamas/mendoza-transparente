import type { Scrutiny, VoteType } from "./types.ts";

export const OFFICE_LABEL: Record<string, string> = {
  gobernador: "Gobernador",
  senadores: "Senadores",
  diputados: "Diputados",
  intendente: "Intendente",
  concejales: "Concejales",
  convencionales: "Convencionales",
};

export const ELECTION_TYPE_LABEL: Record<string, string> = {
  paso: "PASO",
  general: "Generales",
  municipal: "Municipales",
  extraordinaria: "Extraordinaria",
};

export const SCRUTINY_LABEL: Record<Scrutiny, string> = { provisorio: "Provisorio", definitivo: "Definitivo" };

export const VOTE_TYPE_LABEL: Record<VoteType, string> = {
  blanco: "En blanco",
  nulo: "Nulos",
  recurrido: "Recurridos",
  impugnado: "Impugnados",
};

export const SOURCE_LABEL: Record<string, string> = {
  "escrutinios-definitivos": "Junta Electoral de Mendoza: escrutinios definitivos",
  "elecciones-datos-abiertos": "Portal de datos abiertos de Mendoza: escrutinio provisorio por mesa",
  "resultados-provisorios": "Gobierno de Mendoza: sitio de resultados provisorios",
};

const label = (map: Record<string, string>, key: string) => map[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
export const officeLabel = (c: string) => label(OFFICE_LABEL, c);
export const electionTypeLabel = (t: string) => label(ELECTION_TYPE_LABEL, t);

const NUMBER = new Intl.NumberFormat("es-AR");
const PERCENT = new Intl.NumberFormat("es-AR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const formatNumber = (n: number) => NUMBER.format(n);
export const formatPercent = (part: number, total: number) => (total > 0 ? PERCENT.format(part / total) : "–");

/** "2023-09-24" → "24 sep 2023". */
export function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d} ${months[(m ?? 1) - 1]} ${y}`;
}
