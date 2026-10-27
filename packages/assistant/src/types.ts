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

/** One activity of the tarifaria annex with its range: the cheapest and the most expensive category. */
export interface FeeLine {
  /** As printed in the ordinance ("QUIOSCO INTERIOR"). */
  name: string;
  min: number;
  max: number;
}

/**
 * The trade fee of an activity, shown only when the person asked for it. `lines[0]` is the activity we matched; the
 * rest are other activities the same ordinance tells apart (a kiosk inside a shop and a maxikiosco pay differently).
 */
export interface FeeCard {
  municipality: string;
  /** The activity as people say it ("Kiosco"). */
  activity: string;
  lines: FeeLine[];
  /** "mes", "bimestre", "año", or "" when the ordinance does not say. */
  period: string;
  year?: number;
  /** How to read it: who assigns the category, the unit value, a scanned annex… */
  note?: string;
  source: Source;
}

export type Block =
  /** Ask where: "Usar mi ubicación" and "Buscar el municipio" (the 18 municipalities). */
  | { type: "ask_municipality" }
  /**
   * Ask what the business sells. The first four options show as rows; the rest are found with a search sheet
   * (`words` are synonyms for that search). The person can also type.
   */
  | { type: "ask_activity"; options: { id: string; label: string; words?: string[] }[] }
  | {
      type: "steps";
      flow: string;
      municipality: string;
      steps: ProcedureStep[];
      /** Date the steps were last checked against the official sources (YYYY-MM-DD). */
      verified: string;
    }
  /** The trade fee, only when the person asked how much the municipality charges. */
  | { type: "fee"; fee: FeeCard }
  /** Something the person asked that the State does not publish; links to /pedir. */
  | { type: "unpublished"; what: string; agency: string };

/** How the answer ended, for the `assistant.answer.show` event. */
export type Outcome = "steps" | "fee" | "unpublished" | "ask" | "answer" | "no_answer";

/**
 * Something people asked that we do not have yet, saved for later (table `assistant_gaps`): a municipality we have not
 * surveyed, an activity that is not in that municipality's list, or a procedure we do not cover. Never the conversation.
 */
export interface Gap {
  kind: "municipio" | "rubro" | "tramite";
  /** Canonical municipality name, when there is one. */
  municipality?: string;
  /** What was missing: the flow id, or the activity in a few words (normalized and cut). */
  value: string;
}

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
