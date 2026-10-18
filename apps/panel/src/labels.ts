import type { FindingKind, FindingSeverity, FindingStatus } from "@mt/participation/security";
import type { ReviewStatus, SubmissionType } from "./api.ts";

/** One name per thing, the same in every screen of the panel. */
export const REVIEW_LABELS: Record<ReviewStatus, string> = {
  new: "Nuevo",
  in_review: "En revisión",
  resolved: "Resuelto",
  discarded: "Descartado",
  spam: "Spam",
};

export const REVIEW_TABS: { value: ReviewStatus | "all"; label: string }[] = [
  { value: "new", label: "Nuevos" },
  { value: "in_review", label: "En revisión" },
  { value: "resolved", label: "Resueltos" },
  { value: "discarded", label: "Descartados" },
  { value: "spam", label: "Spam" },
  { value: "all", label: "Todos" },
];

export const REVIEW_DOT: Record<ReviewStatus, "good" | "warning" | "critical" | "neutral"> = {
  new: "warning",
  in_review: "warning",
  resolved: "good",
  discarded: "neutral",
  spam: "critical",
};

export const TYPE_LABELS: Record<SubmissionType, string> = {
  request: "Pedido",
  error: "Error",
  data: "Sugerencia",
  photo: "Foto",
  other: "Otro",
};

export const TYPE_FILTERS: { value: SubmissionType | "all"; label: string }[] = [
  { value: "all", label: "Todo" },
  { value: "request", label: "Pedidos" },
  { value: "error", label: "Errores" },
  { value: "data", label: "Sugerencias" },
  { value: "photo", label: "Fotos" },
];

export const REQUEST_LABELS: Record<string, string> = {
  presentado: "Esperando respuesta",
  respondido: "Respondido",
  parcial: "Respondido en parte",
  denegado: "Denegado",
  sin_respuesta: "Sin respuesta",
};

export const PRIVACY_LABELS: Record<string, string> = {
  email: "un correo",
  telefono: "un teléfono",
  dni: "un DNI",
  cuil: "un CUIL",
};

export const FINDING_KIND_LABELS: Record<FindingKind, string> = {
  personal_data: "Datos personales expuestos",
  vulnerability: "Falla de seguridad",
  misconfiguration: "Configuración insegura",
  compromised_site: "Sitio comprometido",
  other: "Otro",
};

export const FINDING_SEVERITY_LABELS: Record<FindingSeverity, string> = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

export const FINDING_STATUS_LABELS: Record<FindingStatus, string> = {
  new: "Sin reportar",
  reported: "Reportado",
  acknowledged: "Confirmado por el organismo",
  fixed: "Corregido",
  discarded: "Descartado",
};

export const FINDING_STATUS_DOT: Record<FindingStatus, "good" | "warning" | "critical" | "neutral"> = {
  new: "critical",
  reported: "warning",
  acknowledged: "warning",
  fixed: "good",
  discarded: "neutral",
};

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-10-11…" → "11 oct 2026" */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

/** Time of today, "ayer" or the date: like an inbox. */
export function shortWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Mendoza" });
  if (day(d) === day(now))
    return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Mendoza" });
  if (day(d) === day(new Date(now.getTime() - 864e5))) return "ayer";
  return formatDate(day(d));
}
