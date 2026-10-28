/**
 * Contrato entre la API del asistente (/api/asistente) y el widget. El modelo escribe el texto; los bloques se arman
 * con lo que devolvieron las herramientas, así que cada cifra y cada enlace en pantalla sale de nuestros datos, no del
 * modelo.
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
  /** Página o formulario oficial del paso. */
  href: string;
  agency: string;
  /** Fecha en que se verificó este paso por última vez (YYYY-MM-DD); si falta, el `verified` del bloque. */
  verified?: string;
}

/** Una actividad del anexo de la tarifaria con su rango: la categoría más barata y la más cara. */
export interface FeeLine {
  /** Tal como está impreso en la ordenanza ("QUIOSCO INTERIOR"). */
  name: string;
  min: number;
  max: number;
}

/**
 * La tasa de comercio de una actividad, que se muestra solo cuando la persona la pidió. `lines[0]` es la actividad que
 * encontramos; el resto son otras actividades que la misma ordenanza distingue (un kiosco dentro de un comercio y un
 * maxikiosco pagan distinto).
 */
export interface FeeCard {
  municipality: string;
  /** La actividad como la dice la gente ("Kiosco"). */
  activity: string;
  lines: FeeLine[];
  /** "mes", "bimestre", "año", o "" cuando la ordenanza no lo dice. */
  period: string;
  year?: number;
  /** Cómo leerla: quién asigna la categoría, el valor unitario, un anexo escaneado… */
  note?: string;
  source: Source;
}

export type Block =
  /** Preguntar dónde: "Usar mi ubicación" y "Buscar el municipio" (los 18 municipios). */
  | { type: "ask_municipality" }
  /**
   * Preguntar qué vende el negocio. Las primeras cuatro opciones se muestran como filas; el resto se encuentra con una
   * hoja de búsqueda (`words` son sinónimos para esa búsqueda). La persona también puede escribir.
   */
  | { type: "ask_activity"; options: { id: string; label: string; words?: string[] }[] }
  | {
      type: "steps";
      flow: string;
      municipality: string;
      steps: ProcedureStep[];
      /** Fecha en que los pasos se verificaron por última vez contra las fuentes oficiales (YYYY-MM-DD). */
      verified: string;
      /** Título del trámite ("Abrir un comercio"), para la carpeta en PDF. */
      title?: string;
      /** La actividad que eligió la persona ("Almacén"). */
      activity?: string;
      /** Papeles para llevar, para tildar en la carpeta en PDF. */
      papers?: string[];
      /** Lo que los organismos no publican de este trámite ("Cuánto tarda la habilitación"). */
      unpublished?: { what: string; agency: string; detail?: string }[];
    }
  /** La tasa de comercio, solo cuando la persona preguntó cuánto cobra el municipio. */
  | { type: "fee"; fee: FeeCard }
  /** Algo que la persona preguntó y el Estado no publica; enlaza a /pedir. */
  | { type: "unpublished"; what: string; agency: string }
  /** Cifras o filas de los datos del sitio (proveedores, autoridades, un municipio…), con la página que tiene el resto. */
  | { type: "data"; card: DataCard };

/**
 * Una tarjeta con lo que el sitio publica sobre algo. Los valores llegan formateados desde las herramientas
 * ("$ 56.992 millones"), así que el widget solo los acomoda. El `href` de una fila y `link` son rutas dentro del sitio
 * ("/proveedores/…").
 */
export interface DataCard {
  title: string;
  rows: { label: string; value: string; detail?: string; href?: string }[];
  /** Cómo leerlo: período, pesos nominales o reales, fecha de corte. */
  note?: string;
  link: { label: string; href: string };
}

/** Cómo terminó la respuesta, para el evento `assistant.answer.show`. */
export type Outcome = "steps" | "fee" | "data" | "unpublished" | "ask" | "answer" | "no_answer";

/**
 * Algo que la gente preguntó y todavía no tenemos, guardado para después (tabla `assistant_gaps`): un municipio que no
 * relevamos, una actividad que no está en la lista de ese municipio o un trámite que no cubrimos. Nunca la conversación.
 */
export interface Gap {
  kind: "municipio" | "rubro" | "tramite";
  /** Nombre canónico del municipio, cuando hay uno. */
  municipality?: string;
  /** Lo que faltaba: el id del flujo, o la actividad en pocas palabras (normalizada y acortada). */
  value: string;
}

export interface AssistantReply {
  text: string;
  blocks: Block[];
  outcome: Outcome;
  /** Recorrido al que pertenece la respuesta, cuando hay uno ("abrir-un-comercio"). */
  flow?: string;
  municipality?: string;
  /** Con Turnstile activado: el pase para los próximos mensajes de esta conversación. */
  pass?: string;
}

/** GET /api/asistente: si el asistente está configurado (al menos una clave de proveedor). Si no, el widget se oculta. */
export interface AssistantStatus {
  enabled: boolean;
  /** Turnstile está activado: el primer mensaje necesita un token, los siguientes el pase de la primera respuesta. */
  challenge?: boolean;
}

/** Cuerpo de POST /api/asistente. Con Turnstile activado, `turnstile` (primer mensaje) o `pass` (el resto). */
export interface AssistantRequest {
  messages: ChatMessage[];
  turnstile?: string;
  pass?: string;
}

export type Vote = "up" | "down";
export type FeedbackReason = "dato" | "respuesta" | "falta";

/** POST /api/asistente/opinion. La nota es texto libre: se guarda en D1, nunca se manda a analítica. */
export interface FeedbackRequest {
  vote: Vote;
  reason?: FeedbackReason;
  note?: string;
  flow?: string;
  municipality?: string;
  outcome?: Outcome;
  /** Los mensajes hasta la respuesta votada. El servidor tapa los datos personales de la persona antes de guardarlos. */
  conversation?: ChatMessage[];
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

/** Lo que Aco está haciendo mientras responde, en streaming al widget: leer la pregunta, ejecutar una herramienta o escribir. */
export type Progress = { phase: "thinking" } | { phase: "tool"; tool: string } | { phase: "writing" };
