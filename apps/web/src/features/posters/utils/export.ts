/**
 * Turns the poster into a PNG (html-to-image) and the A4 one into a PDF (pdf-lib), in the browser. Both libraries load
 * only when someone downloads or shares.
 */
export async function posterPng(node: HTMLElement): Promise<Blob> {
  const { toBlob } = await import("html-to-image");
  const blob = await toBlob(node, { pixelRatio: 1, cacheBust: true, backgroundColor: "#ffffff" });
  if (!blob) throw new Error("No se pudo generar la imagen del cartel");
  return blob;
}

export async function a4Pdf(png: Blob): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle("Cartel de Mendoza Transparente");
  const image = await doc.embedPng(await png.arrayBuffer());
  const [w, h] = [595.28, 841.89];
  doc.addPage([w, h]).drawImage(image, { x: 0, y: 0, width: w, height: h });
  return new Blob([new Uint8Array(await doc.save())], { type: "application/pdf" });
}
