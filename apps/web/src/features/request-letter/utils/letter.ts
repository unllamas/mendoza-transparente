import type { RequestTarget } from "@/types.ts";

/** What the person writes on the letter. It never leaves the device (docs/procesos/web.md#nota-de-pedido). */
export interface Requester {
  city: string;
  name: string;
  dni: string;
  address: string;
  contact: string;
}

export const EMPTY_REQUESTER: Requester = { city: "", name: "", dni: "", address: "", contact: "" };

/** Ley 9070 asks for the requester's name, address and an e-mail or phone (art. 10); the ID number is optional. */
export const legalBasis = (t: RequestTarget) =>
  t.municipal
    ? "los artículos 1, 14, 33 y 75 inc. 22 de la Constitución Nacional, la Ley provincial 9070 y la normativa municipal aplicable"
    : "los artículos 1, 14, 33 y 75 inc. 22 de la Constitución Nacional y la Ley provincial 9070 de Acceso a la Información Pública";

/** Arts. 13 (15 business days), 9 (no need to say why) and 18 (a refusal has to be justified) of Ley 9070. */
export const CLOSING =
  "Pido que se entregue en formato digital y, cuando se trate de datos, en un formato abierto (CSV o XLSX), dentro de los 15 días hábiles que fija el artículo 13 de la Ley 9070. No es necesario explicar el motivo del pedido (artículo 9). Si se rechaza total o parcialmente, pido que se funde por escrito, indicando la norma que lo justifica (artículo 18).";

export const TITLE = "Solicitud de acceso a la información pública";
export const ATTENTION = "At.: funcionario responsable de acceso a la información pública";

/** "25 de octubre de 2026". */
export const longDate = (d = new Date()) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric" }).format(d);

/** An empty field prints as a line to fill in by hand. */
const blank = (v: string, length = 24) => v.trim() || "_".repeat(length);

/** The letter as paragraphs: the PDF draws them and the online-form text joins them. */
export function letterParts(t: RequestTarget, points: string[], p: Requester) {
  const dni = p.dni.trim() ? `, DNI ${p.dni.trim()}` : "";
  return {
    date: `${p.city.trim() || t.city}, ${longDate()}`,
    to: [t.label, ATTENTION, "S / D"],
    title: TITLE.toUpperCase(),
    intro: `Quien suscribe, ${blank(p.name, 30)}${dni}, con domicilio en ${blank(p.address, 30)} y contacto en ${blank(p.contact)}, en ejercicio del derecho reconocido por ${legalBasis(t)}, solicita la siguiente información:`,
    points: points.map((x) => x.trim()).filter(Boolean),
    closing: CLOSING,
  };
}

/** Plain text, to paste in an online form. */
export function letterText(t: RequestTarget, points: string[], p: Requester) {
  const l = letterParts(t, points, p);
  return [
    l.date,
    "",
    ...l.to,
    "",
    l.title,
    "",
    l.intro,
    "",
    ...l.points.map((x, i) => `${i + 1}. ${x}`),
    "",
    l.closing,
    "",
    "Saludos cordiales.",
    "",
    p.name.trim(),
  ].join("\n");
}
