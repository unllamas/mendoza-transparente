import { collapseSpaces, parseArNumber } from "@mt/core";
import { type ActivityRow, pagedLines, type Reader } from "./types.ts";

/** Categories of Godoy Cruz's Anexo A, from the most to the least expensive. */
const CATEGORIES = ["1A", "1B", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

/**
 * Anexo A of Godoy Cruz's tarifaria 2026 (Ordenanza 7497): one line per activity with its code, name, kind (COM, IND,
 * SERV, AP), the amount in pesos for each of the 12 categories and one or two trailing 0/1 flags that the ordinance
 * does not explain. Amounts are kept as published even when a cheaper category costs more than the previous one (a
 * likely typo): those are logged so they can be checked against the original. Group headers ("7000 FABRICACIÓN
 * PRENDAS VESTIR") carry no amounts.
 */
export const reader: Reader = {
  normaId: "297778",
  minActivities: 500,
  read(text) {
    const rows: ActivityRow[] = [];
    let group = "";
    const amount = "\\d{1,3}(?:\\.\\d{3})*,\\d{2}";
    const pattern = new RegExp(`^(\\d{4,6}) (.+?) (COM|IND|SERV|AP) ((?:${amount} ){12})[01](?: [01])*$`);
    for (const { line, page } of pagedLines(text)) {
      const m = line.match(pattern);
      if (m) {
        const amounts = m[4]!.trim().split(" ").map(parseArNumber);
        for (let i = 1; i < amounts.length; i++) {
          if (amounts[i]! > amounts[i - 1]!)
            console.warn(`  revisar ${m[1]} (pág. ${page}): la categoría ${CATEGORIES[i]} cuesta más que la anterior`);
        }
        amounts.forEach((monto, i) =>
          rows.push({
            codigo: m[1]!,
            grupo: group,
            rubro: m[2]!,
            tipo_actividad: m[3]!,
            categoria: CATEGORIES[i]!,
            monto,
            unidad: "pesos",
            pagina: page,
          }),
        );
        continue;
      }
      const g = line.match(/^(\d+000) ([A-ZÁÉÍÓÚÑ][^\d]+)$/);
      if (g) group = collapseSpaces(g[2]!);
    }
    return rows;
  },
};
