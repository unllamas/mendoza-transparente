import { collapseSpaces } from "@mt/core";
import { type ActivityRow, pagedLines, type Reader } from "./types.ts";

/** Size categories of article 21: A is more than 200 m², B from 60 to 200 m², C up to 60 m². */
const CATEGORIES = ["A", "B", "C"];

/** Sections of article 27 that are tables of activities; F and G are prose and give no rows. */
const TABLE_SECTIONS = "ABCDEHIJKLMNOPQ";
const SECTION_ORDER = "ABCDEFGHIJKLMNOPQ";

const AMOUNT = "\\d{1,3}(?:\\.\\d{3})*|\\d+";
/** A row ends with exactly three amounts (A, B, C) and, optionally, a CIIU code or a dash placeholder. */
const ROW_END = new RegExp(`^(.*?)(?:^|\\s)(${AMOUNT}) (${AMOUNT}) (${AMOUNT})(?: ([A-Z]?\\s?\\d{0,7}-*|-+|[A-Z]))?$`);

/** Lines that carry no activity name: column headers, printed page numbers, stray CIIU codes. */
const NOT_A_NAME = /^(?:CONCEPTO\b|CIIU$|CODIGO\b|\d{1,3}$|[A-Z]?\s?\d{6,7}$|-+$|SE CONSIDERA\b)/;
const PAGE_NUMBER = /^\d{1,3}$/;

const ENUMERATOR = /^(?:[ivx]+|[a-z])[.,)]\s/i;
const LETTER_ENUMERATOR = /^[a-z]\)\s/i;
const ROMAN_ENUMERATOR = /^[ivx]+[.,]\s/i;
/** A line that ends in one, two or four amounts (plus an optional CIIU code): a row whose categories cannot be told. */
const ODD_AMOUNTS = /\s\d{1,3}(?:\.\d{3})*(?: \d[\d.]*)*(?: [A-Z]\s?\d{4,7})?[-\s]*$/;

function cleanName(raw: string): string {
  const once = collapseSpaces(raw.replace(/^[-.\s]+/, "").replace(/^(?:[ivx]+|[a-z])[.,)]\s+/i, ""));
  return once.replace(/^(?:[ivx]+|[a-z])[.,)]\s+/i, "").replace(/[.:,\s]+$/, "");
}

function lastIndex(items: string[], test: (item: string) => boolean): number {
  for (let i = items.length - 1; i >= 0; i--) if (test(items[i]!)) return i;
  return -1;
}

const isStart = (line: string) => /^-/.test(line) || ENUMERATOR.test(line);

/**
 * Article 27 of Las Heras's tarifaria 2026 (Ordenanza 54/25), "Derecho anual": per activity, the yearly amount in UT
 * for size categories A, B and C. The text comes out of the PDF with names split over several lines (before or, a few
 * times, after the amounts), enumerators ("i.", "a)", "-") and parent headings ending in ":". Rows are read only when
 * they end in exactly three amounts; a 0 means the category does not exist for that activity and gives no row. Rows
 * with one, two or four amounts (single-category activities, wine categories by hectolitre) are left out: the printed
 * layout does not say which category they belong to. Names are best effort; the amounts and the CIIU code come from
 * the same line and are reliable. Set TRIBUTOS_DEBUG=1 to list the lines left out.
 */
export const reader: Reader = {
  normaId: "298597",
  minActivities: 400,
  read(text) {
    const rows: ActivityRow[] = [];
    let inArticle = false;
    let section = "";
    let group = "";
    let pending: string[] = [];
    let parent = "";
    let sub = "";
    let rowsSinceParent = 0;
    let last: ActivityRow[] | undefined;
    const skipped: string[] = [];

    for (const { line, page } of pagedLines(text)) {
      if (!inArticle) {
        if (/^ARTÍCULO 27º: DERECHO ANUAL/.test(line)) inArticle = true;
        continue;
      }
      if (/^ARTÍCULO 2[89]º/.test(line)) break;
      if (PAGE_NUMBER.test(line)) continue;

      const header = line.match(/^([A-Q])\. (.+)$/);
      if (header && SECTION_ORDER.indexOf(header[1]!) === SECTION_ORDER.indexOf(section) + 1) {
        section = header[1]!;
        group = collapseSpaces(header[2]!).replace(/[:.]$/, "");
        pending = [];
        parent = "";
        sub = "";
        last = undefined;
        continue;
      }
      if (!TABLE_SECTIONS.includes(section)) continue;
      if (NOT_A_NAME.test(line)) {
        last = undefined;
        continue;
      }

      const m = line.match(ROW_END);
      if (m) {
        const amounts = [m[2]!, m[3]!, m[4]!].map((n) => Number(n.replace(/\./g, "")));
        const codeMatch = m[5]?.match(/^([A-Z])\s?(\d{4,7})$/);
        const codigo = codeMatch ? `${codeMatch[1]}${codeMatch[2]}` : "";
        const lines = [...pending, m[1]!.trim()].filter(Boolean);
        pending = [];
        rowsSinceParent++;

        // The name starts at the last line that opens an item ("-", "i.", "a)"); anything before it is context.
        let start = 0;
        for (let i = lines.length - 1; i >= 0; i--) {
          if (isStart(lines[i]!)) {
            start = i;
            break;
          }
        }
        const before = lines.slice(0, start);
        const own = lines.slice(start);
        const first = own[0] ?? "";
        let name = cleanName(own.join(" "));
        if (LETTER_ENUMERATOR.test(first)) {
          const dash = lastIndex(before, (l) => l.startsWith("-"));
          if (dash >= 0) {
            parent = cleanName(before.slice(dash).join(" "));
            sub = "";
          }
          const roman = lastIndex(before, (l) => ROMAN_ENUMERATOR.test(l));
          if (roman >= 0) sub = cleanName(before.slice(roman).join(" "));
          name = [parent, sub, name].filter(Boolean).join(": ");
        } else if (ROMAN_ENUMERATOR.test(first)) {
          sub = "";
          if (parent) name = `${parent.split(": ")[0]}: ${name}`;
        } else if (first.startsWith("-")) {
          parent = "";
          sub = "";
        } else {
          if (parent && rowsSinceParent === 1) name = `${parent}: ${name}`;
          else parent = "";
          sub = "";
        }
        if (!name || name.length > 170) {
          skipped.push(`pág. ${page}: ${line}`);
          last = undefined;
          continue;
        }
        for (let i = 1; i < amounts.length; i++) {
          if (amounts[i - 1]! > 0 && amounts[i]! > amounts[i - 1]!)
            console.warn(`  revisar ${codigo || name} (pág. ${page}): la categoría ${CATEGORIES[i]} cuesta más que la anterior`);
        }
        const made: ActivityRow[] = [];
        amounts.forEach((monto, i) => {
          if (monto > 0)
            made.push({
              codigo,
              grupo: group,
              rubro: name,
              tipo_actividad: "",
              categoria: CATEGORIES[i]!,
              monto,
              unidad: "UT",
              pagina: page,
            });
        });
        rows.push(...made);
        last = made;
        continue;
      }

      // A row we cannot read (one, two or four amounts): its name lines and the ones before it are dropped.
      if (/\d{2}/.test(line.match(ODD_AMOUNTS)?.[0] ?? "") && !/:$/.test(line)) {
        skipped.push(`pág. ${page}: ${line}`);
        pending = [];
        parent = parent && rowsSinceParent === 0 ? parent : "";
        rowsSinceParent++;
        last = undefined;
        continue;
      }

      // A lowercase line right after a row finishes its name ("... cualquier especialidad" / "con internaciones").
      if (last && /^[a-záéíóúñ]/.test(line) && !ENUMERATOR.test(line)) {
        for (const r of last) r.rubro = `${r.rubro} ${collapseSpaces(line).replace(/[.\s]+$/, "")}`;
        continue;
      }
      last = undefined;

      if (/:$/.test(line)) {
        const label = cleanName([...pending.slice(Math.max(0, lastIndex(pending, isStart))), line].join(" "));
        parent = ROMAN_ENUMERATOR.test(line) && parent ? `${parent.split(": ")[0]}: ${label}` : label;
        sub = "";
        rowsSinceParent = 0;
        pending = [];
        continue;
      }
      pending.push(line);
      if (pending.length > 6) pending.shift();
    }
    if (process.env.TRIBUTOS_DEBUG) for (const s of skipped) console.warn(`  descartada ${s}`);
    return rows;
  },
};
