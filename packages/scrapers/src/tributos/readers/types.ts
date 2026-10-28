/**
 * A reader turns the text of a municipal tarifaria (data/processed/tributos/textos/<norma_id>.txt, with
 * "── página N ──" markers) into one row per activity and category of its trade-fee table. One file per
 * municipality in this folder, registered in index.ts, so several agents can write readers in parallel
 * (docs/procesos/tramites-y-tributos.md). Try one without touching data/: `bun run tributos:probar <archivo>`.
 */

export interface ActivityRow {
  /** Activity code as printed in the annex; empty if the annex has none. */
  codigo: string;
  /** Heading the activity appears under, if any. */
  grupo: string;
  /** Activity name as printed (abbreviations included). */
  rubro: string;
  /** Kind or class printed next to the activity (COM, IND…), if any. */
  tipo_actividad: string;
  /** Category label as the annex names it ("1A", "2", "A"…). */
  categoria: string;
  /** Amount as published, in `unidad`. */
  monto: number;
  /** "pesos", or the tax unit the annex uses ("UT", "UTM"). Converted to pesos by the assistant with the flow's unit value. */
  unidad: string;
  /** Page of the text where the row is. */
  pagina: number;
}

export interface Reader {
  /** norma_id of the tarifaria in boletin-oficial/normas.csv (and of its text). */
  normaId: string;
  /** Fewer distinct activities than this means the layout changed and the reader missed lines: the run stops. */
  minActivities: number;
  /** "rows": the annex text comes out by columns in the PDF order, so it is rebuilt by rows (pdfRows) before reading. */
  layout?: "rows";
  read(text: string): ActivityRow[];
}

/** Splits the text into lines, with the page each one is on. */
export function* pagedLines(text: string): Generator<{ line: string; page: number }> {
  let page = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const p = line.match(/^── página (\d+) ──$/);
    if (p) {
      page = Number(p[1]);
      continue;
    }
    if (line) yield { line, page };
  }
}
