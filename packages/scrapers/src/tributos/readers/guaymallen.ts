import { collapseSpaces } from "@mt/core";
import { type ActivityRow, pagedLines, type Reader } from "./types.ts";

const CATEGORIES = ["1", "2", "3", "4"];
const FOUR_AMOUNTS = / \d+ \d+ \d+ \d+$/;
const PROHIBITED = /^\d{5,6} .* 0$/;

/**
 * Anexo B of Guaymallén's tarifaria 2026 (Ordenanza 10298): the trade fee (Derecho de Inspección y Control de
 * Seguridad e Higiene) is a bimestral amount in UTM per activity and category 1º to 4º. Each activity is a code of 5
 * or 6 digits, a name that may wrap over several lines (or start on the line after a lone code) and four integers.
 * Lines are accumulated from the code until the text ends in four integers; the activities with a single trailing 0
 * (prohibited ones, or "Playa de siniestros viales") have no fee and are skipped. A code can appear twice with a
 * different name ("Despensa - Almacén" and "Especias y condimentos", both 472120): both are kept, so the key of an
 * activity is its code plus its name. Section headings ("COMERCIOS MINORISTAS", "INDUSTRIAS") are kept as `grupo`.
 */
export const reader: Reader = {
  normaId: "301163",
  minActivities: 280,
  read(text) {
    const rows: ActivityRow[] = [];
    let inAnnex = false;
    let group = "";
    let buffer = "";
    let bufferPage = 0;
    const seen = new Set<string>();

    const flush = (): void => {
      const full = collapseSpaces(buffer);
      buffer = "";
      const m = full.match(/^(\d{5,6}) (.*?) ?(\d+) (\d+) (\d+) (\d+)$/);
      if (!m) {
        console.warn(`  revisar (pág. ${bufferPage}): rubro sin cuatro montos: ${full.slice(0, 80)}`);
        return;
      }
      const name = m[2]!;
      const key = `${m[1]} ${name}`;
      if (seen.has(key)) console.warn(`  revisar ${m[1]} (pág. ${bufferPage}): rubro repetido «${name}»`);
      seen.add(key);
      for (let i = 0; i < 4; i++)
        rows.push({
          codigo: m[1]!,
          grupo: group,
          rubro: name,
          tipo_actividad: "",
          categoria: CATEGORIES[i]!,
          monto: Number(m[3 + i]),
          unidad: "UTM",
          pagina: bufferPage,
        });
    };

    /** Closes the activity when its text is complete. */
    const settle = (): void => {
      if (FOUR_AMOUNTS.test(buffer)) flush();
      else if (PROHIBITED.test(buffer)) buffer = "";
    };

    for (const { line, page } of pagedLines(text)) {
      if (!inAnnex) {
        if (line.startsWith("ANEXO B - NOMENCLADOR")) inAnnex = true;
        continue;
      }
      if (line === "ANEXO C") break;
      if (line.startsWith("ORDENANZA REGISTRADA")) continue;

      if (buffer) {
        buffer += ` ${line}`;
        settle();
        continue;
      }
      if (/^\d{5,6}( |$)/.test(line)) {
        buffer = line;
        bufferPage = page;
        settle();
        continue;
      }
      const heading = line.replace(/ 1º 2º 3º 4º$/, "");
      if (/^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ()/,.-]+$/.test(heading) && !heading.startsWith("ACLARACION")) {
        group = collapseSpaces(heading.replace(/^\(|\)$/g, ""));
      }
    }
    return rows;
  },
};
