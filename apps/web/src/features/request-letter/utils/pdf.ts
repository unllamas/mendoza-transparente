import type { RequestTarget } from "@/types.ts";
import { letterParts, type Requester } from "./letter.ts";

/**
 * The letter as an A4 PDF, drawn in the browser: the requester's data never goes to a server. pdf-lib is loaded only
 * when someone downloads. Times (a standard PDF font) covers Spanish accents, so no font is embedded.
 */
export async function buildLetterPdf(t: RequestTarget, points: string[], p: Requester): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(`Solicitud de acceso a la información pública - ${t.label}`);
  const regular = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const [W, H, M, SIZE, LEAD] = [595.28, 841.89, 64, 12, 17];
  const ink = rgb(0.08, 0.08, 0.08);
  const grey = rgb(0.3, 0.3, 0.3);
  let page = doc.addPage([W, H]);
  let y = H - M;
  const ensure = (h: number) => {
    if (y - h < M) {
      page = doc.addPage([W, H]);
      y = H - M;
    }
  };
  const wrap = (text: string, font: typeof regular, width: number) => {
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(next, SIZE) > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };
  const paragraph = (
    text: string,
    { font = regular, x = M, width = W - 2 * M, align = "left" as "left" | "right" | "center", after = 10 } = {},
  ) => {
    for (const line of wrap(text, font, width)) {
      ensure(LEAD);
      const w = font.widthOfTextAtSize(line, SIZE);
      const lx = align === "right" ? x + width - w : align === "center" ? x + (width - w) / 2 : x;
      page.drawText(line, { x: lx, y: y - SIZE, size: SIZE, font, color: ink });
      y -= LEAD;
    }
    y -= after;
  };

  const l = letterParts(t, points, p);
  paragraph(l.date, { align: "right", after: 20 });
  paragraph(l.to[0]!, { font: bold, after: 0 });
  paragraph(l.to[1]!, { after: 0 });
  paragraph(l.to[2]!, { after: 22 });
  paragraph(l.title, { font: bold, align: "center", after: 18 });
  paragraph(l.intro, { after: 12 });
  l.points.forEach((point, i) => {
    ensure(LEAD);
    page.drawText(`${i + 1}.`, { x: M + 6, y: y - SIZE, size: SIZE, font: regular, color: ink });
    paragraph(point, { x: M + 24, width: W - 2 * M - 24, after: 6 });
  });
  y -= 8;
  paragraph(l.closing, { after: 12 });
  paragraph("Saludos cordiales.", { after: 36 });

  // Signature on the left, the stamp box for the reception desk on the right.
  ensure(120);
  const top = y;
  page.drawText("Firma:", { x: M, y: top - SIZE, size: SIZE, font: regular, color: ink });
  page.drawLine({ start: { x: M, y: top - 52 }, end: { x: M + 200, y: top - 52 }, thickness: 0.6, color: ink });
  page.drawText(`Aclaración: ${p.name.trim()}`, { x: M, y: top - 72, size: SIZE, font: regular, color: ink });
  const bx = W - M - 190;
  page.drawRectangle({ x: bx, y: top - 100, width: 190, height: 96, borderColor: grey, borderWidth: 0.6, borderDashArray: [3, 3] });
  page.drawText("Recibido", { x: bx + 12, y: top - 24, size: SIZE, font: bold, color: grey });
  page.drawText("Fecha: ____________________", { x: bx + 12, y: top - 52, size: SIZE - 1, font: regular, color: grey });
  page.drawText("Expediente n.º: _____________", { x: bx + 12, y: top - 78, size: SIZE - 1, font: regular, color: grey });

  return new Blob([new Uint8Array(await doc.save())], { type: "application/pdf" });
}
