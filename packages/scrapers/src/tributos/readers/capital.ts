import { collapseSpaces } from "@mt/core";
import { type ActivityRow, pagedLines, type Reader } from "./types.ts";

/** Pages of the text that hold the trade-fee tables (Chapter III, arts. 9 to 15 of Ordenanza 4222). */
const FIRST_PAGE = 10;
const LAST_PAGE = 25;

/** Numbering that precedes or trails a heading: "III.", "4)", "a)". */
const NUMBERING = /^(?:[IVX]+\.|\d+\)|[a-z]\))\s*/;
const TRAILING_NUMBERING = /\s+(?:[IVX]+\.|\d+\)|[a-z]\))$/;
const PAGE_HEADER = /^(?:Honorable Concejo Deliberante|de la Ciudad de Mendoza)$/;

/** A heading in capitals ("TIPOS DE ALOJAMIENTOS (por su actividad específica)") or a numbered one ("III. EXPENDIO…"). */
const GROUP = /^(?:[IVX]+\. )?([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ,.-]{9,}.*)$/;
const ITEM_START = /^(?:\d+\)\s*)?(?:\d+\)|[a-z]\))\s*\S/;

/** Name of the activity out of the lines seen since the last amount: from the last numbered item, else the last heading. */
function activityName(pending: string[], prefix: string): string {
  let start = -1;
  pending.forEach((line, i) => {
    if (ITEM_START.test(line)) start = i;
  });
  if (start < 0) {
    // No numbered item: the lines after the last heading, or the heading itself when they are a paragraph of prose.
    let heading = 0;
    pending.forEach((line, i) => {
      if (GROUP.test(line)) heading = i;
    });
    const after = pending.slice(heading + 1);
    if (!after.length || after.join(" ").length > 100) return cleanLabel(`${pending[heading] ?? ""} ${prefix}`);
    start = heading + 1;
  }
  const label = cleanLabel([...pending.slice(start), prefix].join(" "));
  const cut = label.indexOf(" (");
  return label.length > 100 && cut > 0 ? label.slice(0, cut) : label;
}

function cleanLabel(raw: string): string {
  let label = collapseSpaces(raw);
  for (let previous = ""; previous !== label; ) {
    previous = label;
    label = label.replace(NUMBERING, "").replace(TRAILING_NUMBERING, "");
  }
  return label.trim();
}

/**
 * Chapter III of Capital's Ordenanza tarifaria 4222 (2026): the "Derechos de Inspección y Control" are a fixed amount in
 * UTM per activity and category, paid every two months. Each amount sits on its own line as
 * `1 <chapter> <group> <activity> <variant> <category> <amount> UTM` and the activity name is on the line above, so the
 * reader carries the last heading it saw. The ordinance does not say what each category (10, 20, 30, 40) stands for.
 *
 * Quirks of the text, handled here:
 * - A name can be cut by a page break or glued to the code line ("deportivas 1 14 6 13 11 10 1290 UTM"): the text before
 *   the code is joined to the pending heading.
 * - Empty headings ("IV.", "3)") and the page header are skipped.
 * - The educational row of art. 13 comes out with its six numbers on alternate lines between words; it is rebuilt.
 * - `codigo` is the activity code without the category (the last pair), e.g. "11030311".
 * - A few codes are broken (p. 18, "1 14 4 01 11 1 3763 UTM": categories "1" to "4" instead of "10" to "40"): kept as
 *   printed and logged, not corrected.
 */
export const reader: Reader = {
  normaId: "301387",
  minActivities: 100,
  read(text) {
    const rows: ActivityRow[] = [];
    const code = /^(?:(.*?)\s+)?(1(?: \d+){5}) ([\d.]+) UTM$/;
    const bareAmount = /^([\d.]+) UTM$/;
    let group = "";
    let pending: string[] = [];
    let label = "";
    let loose: string[] = [];

    const push = (parts: string[], amount: string, page: number, name: string) => {
      const monto = Number(amount.replace(/\./g, ""));
      if (!Number.isFinite(monto)) return;
      if (parts[5]!.length === 1) console.warn(`  revisar ${parts.join(" ")} (pág. ${page}): la categoría viene con un solo dígito`);
      rows.push({
        codigo: parts.slice(0, 5).join(""),
        grupo: group,
        rubro: name,
        tipo_actividad: "",
        categoria: parts[5]!,
        monto,
        unidad: "UTM",
        pagina: page,
      });
    };

    for (const { line, page } of pagedLines(text)) {
      if (page < FIRST_PAGE || page > LAST_PAGE || PAGE_HEADER.test(line)) continue;
      const m = line.match(code);
      if (m) {
        const prefix = m[1] ?? "";
        if (prefix || pending.length) {
          label = activityName(pending, prefix) || label;
          pending = [];
        }
        loose = [];
        push(m[2]!.split(" "), m[3]!, page, label);
        continue;
      }
      const bare = line.match(bareAmount);
      if (bare && loose.length >= 6) {
        const parts = loose.slice(-6);
        if (parts[0] === "1") {
          if (pending.length) {
            label = cleanLabel(pending.join(" ")) || label;
            pending = [];
          }
          push(parts, bare[1]!, page, label);
        }
        loose = [];
        continue;
      }
      if (/^\d{1,2}$/.test(line)) {
        loose.push(line);
        continue;
      }
      if (/^Artículo \d+/.test(line) && line.length < 20) continue;
      const heading = line.match(GROUP);
      if (heading) group = cleanLabel(heading[1]!);
      pending.push(line);
    }
    return rows;
  },
};
