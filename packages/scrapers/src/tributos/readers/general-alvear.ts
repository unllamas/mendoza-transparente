import { collapseSpaces, parseArNumber } from "@mt/core";
import { type ActivityRow, pagedLines, type Reader } from "./types.ts";

const DASH = /[–—]/g;
/** `8 - 1 - 3 - 0 - 1 ........ 350838,08`: the code (article 5 = COD.8), dots or ellipsis, and the amount. */
const ROW = /(?:^|\s)(8)\s*-\s*(\d+)\s*-\s*(\d+)\s*-\s*(\d+)\s*-\s*(\d+)[\s.…]*?([\d.]*\d,\d{2})\s*$/;
/** An item of the table: "3) Almacenes de ramos generales minoristas:" or "4-a) Vinotecas:". */
const ITEM = /^\d+(?:\s*-\s*[a-z])?\)\s*\S/;
const ROMAN_SECTION = /^([IVX]+)\s*-\s*(\S.*)$/;
const TABLE_START = /^ART\.\s*5\)/;
const TABLE_END = /^ART\.\s*6\)/;
/** Lines that are a printed page number or a column heading, not part of a name. */
const NOISE = /^(?:\d{1,3}|Categoria X|Articulo XXX|Encuadramiento .*|Sub Encuadramiento XX|Codificacion .*)$/;

function clean(raw: string): string {
  return collapseSpaces(
    raw
      .replace(/^\d+(?:\s*-\s*[a-z])?\)\s*/, "")
      .replace(/\s*[:.]+\s*$/, "")
      .replace(/\/\/\s*$/, ""),
  );
}

/**
 * Article 5 (COD.8) of General Alvear's Ordenanza tarifaria 2026, second semester: the "Derechos de Inspección,
 * Inscripción, Higiene y Control de Comercios, Industrias y Actividades Civiles", yearly ("derechos anuales"). Each
 * row is a code `8 - section - item - subitem - category` and the amount in UTM (art. 51 sets the UTM at $ 1, adjusted
 * by resolution). The tariff prints no definition of the categories, so `categoria` is the last number of the code.
 *
 * Quirks of the text, handled here:
 * - Dashes can be "-" or "–", the filler is dots or "…", and some rows have no filler.
 * - Rows without an amount ("derogado", blank) are skipped. Surcharge rows ("Tendrán un recargo de 8 - 1 - 13 - 0 - 6")
 *   are kept under the item they follow, with their lead-in text as part of the name.
 * - The name is the last item ("13) Despensas") plus the short line above the row when there is one ("En distritos",
 *   "b) Cervecerias:"). `codigo` is the code without the category: "8-1-13-0".
 */
export const reader: Reader = {
  normaId: "general-alvear-2026",
  minActivities: 150,
  read(text) {
    const rows: ActivityRow[] = [];
    let inTable = false;
    let section = "";
    let item = "";
    let sub = "";
    let loose: string[] = [];

    for (const { line: raw, page } of pagedLines(text)) {
      const line = raw.replace(DASH, "-");
      if (TABLE_START.test(line)) {
        inTable = true;
        continue;
      }
      if (TABLE_END.test(line)) break;
      if (!inTable || NOISE.test(line)) continue;

      const m = line.match(ROW);
      if (m) {
        const lead = line
          .slice(0, m.index)
          .replace(/[.…\s]+$/, "")
          .trim();
        const name = [item, sub, lead ? clean(lead) : ""].filter(Boolean).join(" - ");
        rows.push({
          codigo: `${m[1]}-${m[2]}-${m[3]}-${m[4]}`,
          grupo: section,
          rubro: name,
          tipo_actividad: "",
          categoria: m[5]!,
          monto: parseArNumber(m[6]!),
          unidad: "UTM",
          pagina: page,
        });
        loose = [];
        continue;
      }
      if (/^8\s*-\s*\d+/.test(line)) continue; // a code with no amount
      const roman = line.match(ROMAN_SECTION);
      if (roman && roman[2]!.length > 8 && roman[2] === roman[2]!.toUpperCase()) {
        section = clean(roman[2]!);
        item = "";
        sub = "";
        loose = [];
        continue;
      }
      if (ITEM.test(line)) {
        item = clean(line);
        sub = "";
        loose = [];
        continue;
      }
      // A short line between the item and its amounts is a sub-heading; long prose is not.
      loose.push(line);
      if (loose.length > 2) loose = [];
      sub = loose.length && loose.join(" ").length <= 70 ? clean(loose.join(" ")) : "";
    }
    return rows;
  },
};
