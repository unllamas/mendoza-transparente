/**
 * Contract between the assistant API (/api/asistente) and the widget. The model writes the text; the blocks are
 * built from what the tools returned, so every figure and link on screen comes from our data, not from the model.
 */

export type Role = "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

/** POST /api/asistente */
export interface AssistantRequest {
  messages: ChatMessage[];
}

export type Level = "nacion" | "provincia" | "municipio";

export interface Source {
  label: string;
  href: string;
}

export interface ProcedureStep {
  level: Level;
  title: string;
  detail: string;
  /** Official page or form for the step. */
  href: string;
  agency: string;
}

export interface FeeRange {
  /** "Derecho de comercio de un almacén, 2026" */
  label: string;
  min: number;
  max: number;
  /** Extra line that changes how to read it (provisional rate while the permit is pending…). */
  note?: string;
  source: Source;
}

export type Block =
  /** Ask where: "Usar mi ubicación" and "Buscar el municipio" (the 18 municipalities). */
  | { type: "ask_municipality" }
  /** Ask what the business sells, with a few options; the person can also type. */
  | { type: "ask_activity"; options: { id: string; label: string }[] }
  | {
      type: "steps";
      flow: string;
      municipality: string;
      steps: ProcedureStep[];
      fee?: FeeRange;
      /** Date the steps were last checked against the official sources (YYYY-MM-DD). */
      verified: string;
    }
  /** Something the person asked that the State does not publish; links to /pedir. */
  | { type: "unpublished"; what: string; agency: string };

/** How the answer ended, for the `assistant.answer.show` event. */
export type Outcome = "steps" | "unpublished" | "ask" | "answer" | "no_answer";

export interface AssistantReply {
  text: string;
  blocks: Block[];
  outcome: Outcome;
  /** Recorrido the answer belongs to, when there is one ("abrir-un-comercio"). */
  flow?: string;
  municipality?: string;
}

/** GET /api/asistente: whether the assistant is configured (at least one provider key). The widget hides otherwise. */
export interface AssistantStatus {
  enabled: boolean;
}

export type Vote = "up" | "down";
export type FeedbackReason = "dato" | "respuesta" | "falta";

/** POST /api/asistente/opinion. The note is free text: stored in D1, never sent to analytics. */
export interface FeedbackRequest {
  vote: Vote;
  reason?: FeedbackReason;
  note?: string;
  flow?: string;
  municipality?: string;
  outcome?: Outcome;
}

export const MUNICIPALITIES = [
  "Capital",
  "General Alvear",
  "Godoy Cruz",
  "Guaymallén",
  "Junín",
  "La Paz",
  "Las Heras",
  "Lavalle",
  "Luján de Cuyo",
  "Maipú",
  "Malargüe",
  "Rivadavia",
  "San Carlos",
  "San Martín",
  "San Rafael",
  "Santa Rosa",
  "Tunuyán",
  "Tupungato",
] as const;
