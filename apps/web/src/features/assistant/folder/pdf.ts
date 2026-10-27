import type { FolderContent } from "./content.ts";

/**
 * The procedure folder as an A4 PDF, drawn in the browser: nothing goes to a server. pdf-lib is loaded only when
 * someone downloads. Helvetica (a standard PDF font) covers Spanish accents, so no font is embedded.
 */
export async function buildFolderPdf(c: FolderContent): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(`Carpeta del trámite: ${c.title}`);
  doc.setAuthor("Mendoza Transparente");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [W, H, M] = [595.28, 841.89, 56];
  const ink = rgb(0.08, 0.08, 0.08);
  const grey = rgb(0.35, 0.35, 0.35);
  const blue = rgb(0.05, 0.3, 0.6);
  let page = doc.addPage([W, H]);
  let y = H - M;
  const ensure = (h: number) => {
    if (y - h < M) {
      page = doc.addPage([W, H]);
      y = H - M;
    }
  };
  // WinAnsi only: anything else (arrows, emoji) would make pdf-lib throw.
  const clean = (t: string) => t.replace(/[^\x20-\x7E\xA0-\xFF–—‘’“”•…\s]/g, "").replace(/\s+/g, " ");
  type Font = typeof regular;
  const wrap = (text: string, font: Font, size: number, width: number) => {
    const lines: string[] = [];
    let line = "";
    const fits = (t: string) => font.widthOfTextAtSize(t, size) <= width;
    for (let word of clean(text).trim().split(" ")) {
      // A URL longer than the line is cut by characters instead of overflowing the page.
      while (!fits(word)) {
        let n = word.length - 1;
        while (n > 1 && !fits(word.slice(0, n))) n--;
        if (line) lines.push(line);
        lines.push(word.slice(0, n));
        line = "";
        word = word.slice(n);
      }
      const next = line ? `${line} ${word}` : word;
      if (line && !fits(next)) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };
  const text = (t: string, { font = regular, size = 10.5, x = M, color = ink, after = 6 } = {}) => {
    const lead = size * 1.4;
    for (const line of wrap(t, font, size, W - M - x)) {
      ensure(lead);
      page.drawText(line, { x, y: y - size, size, font, color });
      y -= lead;
    }
    y -= after;
  };
  const heading = (t: string) => {
    ensure(60);
    y -= 8;
    text(t, { font: bold, size: 13, after: 3 });
    page.drawLine({ start: { x: M, y: y + 1 }, end: { x: W - M, y: y + 1 }, thickness: 0.6, color: grey });
    y -= 8;
  };

  text("Mendoza Transparente · Carpeta del trámite", { size: 9, color: grey, after: 8 });
  text(c.title, { font: bold, size: 22, after: 2 });
  if (c.subtitle) text(c.subtitle, { size: 13, after: 2 });
  text(c.downloaded, { size: 10, color: grey, after: 6 });

  for (const group of c.groups) {
    heading(group.heading);
    for (const s of group.steps) {
      ensure(70);
      page.drawText(`${s.number}.`, { x: M, y: y - 10.5, size: 10.5, font: bold, color: ink });
      text(s.title, { font: bold, x: M + 20, after: 1 });
      text(s.agency, { x: M + 20, size: 9.5, color: grey, after: 2 });
      if (s.detail) text(s.detail, { x: M + 20, after: 2 });
      text(s.href, { x: M + 20, size: 9, color: blue, after: 1 });
      text(`Verificado el ${s.verified}`, { x: M + 20, size: 9, color: grey, after: 9 });
    }
  }

  if (c.checklist.length) {
    heading("Para tachar");
    for (const item of c.checklist) {
      ensure(18);
      page.drawRectangle({ x: M + 2, y: y - 11, width: 10, height: 10, borderColor: ink, borderWidth: 0.8 });
      text(item, { x: M + 22, after: 4 });
    }
  }

  if (c.unpublished.length) {
    heading("Lo que no se publica");
    for (const u of c.unpublished) text(`• ${u}`, { after: 4 });
  }

  y -= 14;
  ensure(90);
  page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.6, color: grey });
  y -= 6;
  for (const line of c.footer) text(line, { size: 9, color: grey, after: 3 });
  text(c.siteUrl, { size: 9, font: bold, color: blue, after: 0 });

  return new Blob([new Uint8Array(await doc.save())], { type: "application/pdf" });
}
