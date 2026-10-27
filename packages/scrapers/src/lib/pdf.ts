/** Texto de un PDF con unpdf, para no repetir la misma llamada en cada scraper. */

import { extractText, getDocumentProxy } from "unpdf";

/** Todo el texto del PDF, con las páginas unidas. */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: true });
  return text;
}

/** El texto de cada página por separado. */
export async function pdfPages(bytes: Uint8Array): Promise<string[]> {
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: false });
  return text;
}

interface TextPiece {
  s: string;
  x: number;
  y: number;
}

/**
 * El texto de cada página armado por filas: junta lo que está a la misma altura, de izquierda a derecha. Sirve para
 * las tablas cuyo texto, en el orden del PDF, sale por columnas (los nombres juntos y después los códigos y montos).
 */
export async function pdfRows(bytes: Uint8Array, tolerance = 3): Promise<string[]> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const pages: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    const pieces: TextPiece[] = [];
    for (const item of content.items) {
      if ("str" in item && item.str.trim()) pieces.push({ s: item.str.trim(), x: item.transform[4]!, y: item.transform[5]! });
    }
    pieces.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: { y: number; parts: TextPiece[] }[] = [];
    for (const piece of pieces) {
      const line = lines.at(-1);
      if (line && line.y - piece.y <= tolerance) line.parts.push(piece);
      else lines.push({ y: piece.y, parts: [piece] });
    }
    pages.push(
      lines
        .map((l) =>
          l.parts
            .sort((a, b) => a.x - b.x)
            .map((p) => p.s)
            .join(" "),
        )
        .join("\n"),
    );
  }
  return pages;
}
