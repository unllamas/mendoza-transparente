import { collapseSpaces } from "@mt/core";
import { type ActivityRow, pagedLines, type Reader } from "./types.ts";

/** Last line of the printed letterhead of a page (its address or contacts), after some lines of OCR junk. The OCR garbles it. */
const LETTERHEAD_END = /\(263\)|4442265|rivadaviamendoza|hcd@|Valle y/i;
const GROUP = /^(\d{3})\s*[-—_]\s*(\S.*)$/;
/** Code and, if it fits on the line, the amount; the OCR sometimes leaves a space inside a pair ("12-063-0 1-00-0 1"). */
const CODE = /(\d{2}-\d ?\d ?\d[-.]\d ?\d-\d ?\d-\d ?\d)(?:[\s,–-]+([\d.]+)\s*UTM)?[\s•.]*$/;
const BARE_AMOUNT = /^([\d.]+)\s*UTM$/;
/** "1 - ", "2- ", "3 _ " that starts an item of a group; the last one in the label wins. */
const ITEM_MARKER = /(?:^|\s)\d{1,2}\s*[-—_]\s*/g;
/** A line that only names the category of the item above: "2° categoría", "I° categoría", "categoría"; the OCR turns "2°" into "20" or "28". */
const CATEGORY_ONLY = /^(?:[\dI]\s*[°08]?\s*)?cat(?:egor[ií]a|\.)\.?$/i;
/** The same, at the end of a name ("Por Menor 1° categoría"): the category is already in `categoria`. */
const TRAILING_CATEGORY = /\s+[\dI][°08]?\s*categor[ií]a$/i;

/**
 * Anexo III of Rivadavia's Ordenanza tarifaria 5303 (2026): "Clasificación de comercios y pago anual". Every line of
 * the table is an item of an activity ("1 - Venta exclusiva", "2° categoría") with its code (12-013-01-00-01) and an
 * annual amount in UTM. The PDF comes out by columns, so the annex is read from the text rebuilt by rows (`layout:
 * "rows"`): the name, the code and the amount of one line end up together.
 *
 * - `codigo` is the code without its last pair (12-013-01-00) and `categoria` that last pair ("01", "02"; "00" is the
 *   row printed with no category). The activity code alone repeats across rows, so `rubro` carries the group and the item.
 * - A name can wrap onto the next line (the code is on the last one) and an amount can fall on the line below the code:
 *   both are joined.
 * - A "2° categoría" row takes the name of the item above it. A sub-heading ("En locales establecidos") that comes
 *   before "1 - 1° categoría" names that item.
 * - Under the Salud group the sub-items repeat their numbers (1, 2, 3 under each type): the parent type is not kept.
 * - Amounts are kept as printed, even one that looks wrong (12-123-01-00-01 says 2000000 UTM).
 */
export const reader: Reader = {
  normaId: "300518",
  minActivities: 400,
  layout: "rows",
  read(text) {
    const rows: ActivityRow[] = [];
    const lines = [...pagedLines(text)];
    const start = lines.findIndex((l) => l.line === "ANEXO III");
    const end = lines.findIndex((l, i) => i > start && l.line === "ANEXO IV");
    if (start < 0 || end < 0) throw new Error("Rivadavia: no se encuentra el Anexo III");

    let group = "";
    let groupOpen = false;
    let lastItem = "";
    let pending: string[] = [];
    let awaiting: { code: string; item: string; page: number } | undefined;
    let lastPage = lines[start]!.page;
    let letterheadEnd = -1;
    let skipped = 0;

    const push = (code: string, item: string, amount: string, page: number) => {
      const monto = Number(amount.replace(/\./g, ""));
      if (!Number.isFinite(monto)) return;
      const parts = code.split("-");
      rows.push({
        codigo: parts.slice(0, 4).join("-"),
        grupo: group,
        rubro: collapseSpaces(`${group} - ${item}`),
        tipo_actividad: "",
        categoria: parts[4]!,
        monto,
        unidad: "UTM",
        pagina: page,
      });
    };

    const itemName = (label: string): string => {
      const markers = [...label.matchAll(ITEM_MARKER)];
      const last = markers.at(-1);
      const before = last
        ? label
            .slice(0, last.index)
            .trim()
            .replace(/^\d{1,2}\s*[-—_]\s*/, "")
        : "";
      let name = collapseSpaces(last ? label.slice(last.index + last[0].length) : label)
        .replace(/^[-•]\s*/, "")
        .replace(TRAILING_CATEGORY, "")
        .replace(/\s*[-–]$/, "");
      // With no item above (or sub-heading), the category line is all the name there is.
      if (CATEGORY_ONLY.test(name)) name = before || lastItem || name;
      return name;
    };

    for (const { line, page } of lines.slice(start + 1, end)) {
      if (page !== lastPage) {
        lastPage = page;
        // The OCR junk of the letterhead sits above its last line; the table starts after it.
        const onPage = lines.filter((l) => l.page === page);
        const at = onPage.slice(0, 8).reduce((last, l, i) => (LETTERHEAD_END.test(l.line) ? i : last), -1);
        letterheadEnd = at < 0 ? -1 : at + 1;
        skipped = 0;
      }
      if (skipped < letterheadEnd) {
        skipped++;
        continue;
      }
      if (/^(CLASIFICACIÓN DE COMERCIOS|DERECHOS DE INSPECCIÓN|INDUSTRIAS Y ACTIVIDADES CIVILES)/.test(line)) continue;

      if (awaiting) {
        const bare = line.match(BARE_AMOUNT);
        const pendingRow = awaiting;
        awaiting = undefined;
        if (bare) {
          push(pendingRow.code, pendingRow.item, bare[1]!, pendingRow.page);
          continue;
        }
        console.warn(`  revisar ${pendingRow.code} (pág. ${pendingRow.page}): el monto no está en la línea siguiente`);
      }

      const heading = line.match(GROUP);
      if (heading && !CODE.test(line)) {
        group = collapseSpaces(heading[2]!);
        groupOpen = true;
        lastItem = "";
        pending = [];
        continue;
      }
      // A group name can wrap onto uppercase lines: "ARTÍCULOS DE ELECTRICIDAD, ARTEFACTOS" / "DEL HOGAR…".
      if (groupOpen && !CODE.test(line) && line === line.toUpperCase() && !/^\d/.test(line)) {
        group = collapseSpaces(`${group} ${line}`);
        continue;
      }
      groupOpen = false;

      const code = line.match(CODE);
      if (!code && /UTM/.test(line)) console.warn(`  revisar (pág. ${page}): línea con monto y sin código legible: ${line}`);
      if (!code) {
        pending.push(line);
        continue;
      }
      const label = collapseSpaces([...pending, line.slice(0, code.index)].join(" "));
      pending = [];
      const item = itemName(label);
      if (item) lastItem = item;
      if (code[2]) push(code[1]!.replace(/ /g, ""), item, code[2], page);
      else awaiting = { code: code[1]!.replace(/ /g, ""), item, page };
    }
    return rows;
  },
};
