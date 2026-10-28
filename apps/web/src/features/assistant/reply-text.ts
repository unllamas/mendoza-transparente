import type { Block } from "@mt/assistant/types";

/**
 * El texto de Aco llega con el markdown que escribe el modelo (**negrita**, [links](/ruta), listas con guiones). Se
 * entiende un subconjunto chico y todo lo demás queda como texto: nunca HTML.
 */
export type Inline =
  | { type: "text"; value: string }
  | { type: "strong"; value: string }
  | { type: "em"; value: string }
  | { type: "link"; label: string; href: string; internal: boolean };

export type Paragraph = { kind: "p" | "li"; inlines: Inline[] };

const SITE_HOST = /^https?:\/\/(?:www\.)?mendoza-transparente\.com(?=\/|$)/i;

/** Una dirección del sitio se vuelve su ruta ("https://mendoza-transparente.com/leyes" → "/leyes"). */
export function normalizeHref(href: string): string {
  const path = href.trim().replace(SITE_HOST, "");
  if (path === "") return "/";
  // Sin la barra final, para que "/leyes/" y "/leyes" sean el mismo link.
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/**
 * Los links que el texto puede mostrar: los mismos que trajeron las herramientas en los bloques de esa respuesta. El
 * modelo solo escribe el texto, así que un link que no salió de una herramienta se muestra como texto y no se abre.
 */
export function allowedHrefs(blocks: Block[]): Set<string> {
  const hrefs: string[] = [];
  for (const block of blocks) {
    if (block.type === "steps") hrefs.push(...block.steps.map((s) => s.href));
    if (block.type === "fee" && block.fee.source.href) hrefs.push(block.fee.source.href);
    if (block.type === "data") {
      hrefs.push(block.card.link.href);
      for (const row of block.card.rows) if (row.href) hrefs.push(row.href);
    }
    if (block.type === "unpublished") hrefs.push("/pedir");
  }
  return new Set(hrefs.map(normalizeHref));
}

// [texto](destino) · **negrita** o __negrita__ · *cursiva* o _cursiva_ · una dirección suelta del sitio o de afuera.
const INLINE =
  /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|(?<![\w*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?!\w)|(?<!\w)_(?=\S)([^_\n]+?)(?<=\S)_(?!\w)|(https?:\/\/[^\s)]+[^\s).,;:!?»”])/g;

function parseInlines(text: string, allowed: Set<string>): Inline[] {
  const out: Inline[] = [];
  const pushText = (value: string) => {
    if (!value) return;
    const prev = out[out.length - 1];
    if (prev?.type === "text") prev.value += value;
    else out.push({ type: "text", value });
  };
  const pushLink = (label: string, raw: string) => {
    const href = normalizeHref(raw);
    if (allowed.has(href)) out.push({ type: "link", label, href, internal: href.startsWith("/") });
    else pushText(label);
  };
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const start = m.index ?? 0;
    pushText(text.slice(last, start));
    last = start + m[0].length;
    const [, label, href, strong1, strong2, em1, em2, url] = m;
    if (label && href) pushLink(label, href);
    else if (strong1 || strong2) out.push({ type: "strong", value: (strong1 ?? strong2) as string });
    else if (em1 || em2) out.push({ type: "em", value: (em1 ?? em2) as string });
    else if (url) pushLink(url, url);
  }
  pushText(text.slice(last));
  // El código en línea (`así`) no tiene sentido en una respuesta para la gente: se ven solo las palabras.
  for (const inline of out) if (inline.type === "text") inline.value = inline.value.replace(/`([^`]*)`/g, "$1");
  return out;
}

const LIST_ITEM = /^\s*(?:[-*•]|\d+[.)])\s+/;

/** Separa el texto en párrafos (línea en blanco) e ítems de lista (líneas que empiezan con guion o número). */
export function parseReplyText(text: string, allowed: Set<string> = new Set()): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  for (const chunk of text.split(/\n\s*\n/)) {
    let current: string[] = [];
    const flush = () => {
      const joined = current.join(" ").trim();
      if (joined) paragraphs.push({ kind: "p", inlines: parseInlines(joined, allowed) });
      current = [];
    };
    for (const line of chunk.split("\n")) {
      // Los títulos (# …) se leen como un párrafo más: en un chat de un tuit no hay secciones.
      const clean = line.replace(/^\s*#{1,6}\s+/, "");
      if (LIST_ITEM.test(clean)) {
        flush();
        paragraphs.push({ kind: "li", inlines: parseInlines(clean.replace(LIST_ITEM, "").trim(), allowed) });
      } else current.push(clean.trim());
    }
    flush();
  }
  return paragraphs;
}

/** El mismo texto sin marcas, para lo que se anuncia a los lectores de pantalla. */
export function plainReplyText(text: string): string {
  return parseReplyText(text, new Set())
    .map((p) => p.inlines.map((i) => (i.type === "link" ? i.label : i.value)).join(""))
    .join(" ");
}
