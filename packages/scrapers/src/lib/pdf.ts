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
