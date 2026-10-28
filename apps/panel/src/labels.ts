import type { FindingKind, FindingSeverity, FindingStatus } from "@mt/participation/security";
import type { ReviewStatus, SubmissionType } from "./api.ts";

/** Un nombre por cosa, el mismo en todas las pantallas del panel. */
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

export const ASSISTANT_REASON_LABELS: Record<string, string> = {
  dato: "Un dato está mal",
  respuesta: "No respondió lo que preguntó",
  falta: "Falta información o un paso",
};

export const ASSISTANT_GAP_LABELS: Record<"municipio" | "rubro" | "tramite", string> = {
  municipio: "Municipio sin relevar",
  rubro: "Rubro",
  tramite: "Trámite",
};

/** Qué devolvió Aco (`outcome` de la respuesta). */
export const ASSISTANT_OUTCOME_LABELS: Record<string, string> = {
  steps: "Pasos de un trámite",
  fee: "Tasa de un rubro",
  data: "Datos del sitio",
  unpublished: "Algo que no se publica",
  ask: "Repreguntó",
  answer: "Respuesta de texto",
  no_answer: "No supo responder",
};

export const ASSISTANT_TASK_LABELS: Record<"tools" | "answer", string> = {
  tools: "Leer y elegir herramientas",
  answer: "Redactar la respuesta",
};

export const ASSISTANT_PROVIDER_LABELS: Record<string, string> = {
  gateway: "Vercel AI Gateway",
  openrouter: "OpenRouter",
};

/** Dólares con los decimales que hacen falta: un centavo de dólar alcanza para varias respuestas. */
export function formatUsd(usd: number): string {
  const digits = usd > 0 && usd < 0.01 ? 4 : usd < 10 ? 3 : 2;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  }).format(usd);
}

/** 12345 → "12,3 mil". */
export function formatCompact(n: number): string {
  // Intl devuelve "5 K" y "151,2 k" según el número: se deja siempre en minúscula.
  return new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 }).format(n).replace(/\sK$/, " k");
}

/** 2345 → "2,3 s". */
export function formatSeconds(ms: number): string {
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(ms / 1000)} s`;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-10-11…" → "11 oct 2026" */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

/** La hora si es de hoy, "ayer" o la fecha: como en una bandeja de correo. */
export function shortWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Mendoza" });
  if (day(d) === day(now))
    return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Mendoza" });
  if (day(d) === day(new Date(now.getTime() - 864e5))) return "ayer";
  return formatDate(day(d));
}
