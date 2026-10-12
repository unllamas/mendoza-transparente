/**
 * Leyes: del texto plano del Boletín Oficial a una estructura legible (encabezado, capítulos, artículos
 * y firmantes) y un título propio. El resumen en lenguaje simple sale de data/curado/leyes.yaml
 * (ver docs/procesos/metodologia.md#resumenes-de-leyes).
 */

import type { LeyBloque, LeyCierre } from "../../src/types.ts";

export interface ResumenLey {
  numero: string;
  titulo: string;
  tema: string;
  resumen: string;
  puntos: string[];
}

export interface LeyEstructurada {
  /** Nombre que la propia ley se da (p. ej. "Régimen especial penal juvenil"), si lo tiene. */
  encabezado: string | null;
  bloques: LeyBloque[];
  cierre: LeyCierre | null;
}

const PREAMBULO = /^(?:.*FUERZA\s+DE\s*)?L\s*E\s*Y\s*(?::|$)\s*(.*)$/i;
const ARTICULO = /^(?:ART[IÍ]CULO|ART)\.?\s*(\d+)\s*(?:(?:[°º]|o(?=[\s.\-–—:]))\.?)?\s*[-–—.:)]*\s*(.*)$/i;
const SECCION = /^(?:CAP[IÍ]TULO|T[IÍ]TULO|SECCI[OÓ]N|LIBRO|PARTE)\b/i;
const HONORIFICOS = /^(?:(?:SDORA|SDOR|SEN|DIP|LIC|DRA|DR|ING|CPN|CDORA|CDOR|PROF|ARQ|SRA|SR|ABOG|ESC|MGTER|T[EÉ]C)(?:\.\s*|\s+))+/i;
const TRAMITE = /^comun[ií]quese(?:\s+al\s+poder\s+ejecutivo)?[\s.,;]*(?:e\s+ins[eé]rtese.*)?$/i;

const esMayusculas = (s: string) => /\p{L}/u.test(s) && s === s.toUpperCase();

/** "RÉGIMEN ESPECIAL PENAL JUVENIL" → "Régimen especial penal juvenil" (respeta Mendoza y siglas). */
export function oracion(s: string): string {
  if (!esMayusculas(s)) return s;
  const bajo = s.toLowerCase().replace(/\bmendoza\b/g, "Mendoza").replace(/\bargentina\b/g, "Argentina");
  return bajo.charAt(0).toUpperCase() + bajo.slice(1);
}

const nombrePropio = (s: string) =>
  s
    .replace(HONORIFICOS, "")
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, l: string) => sep + l.toUpperCase());

export function estructurarLey(texto: string): LeyEstructurada {
  let lineas = texto.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);

  // Preámbulo: "EL SENADO Y CÁMARA DE DIPUTADOS … SANCIONAN CON FUERZA DE / L E Y :"
  const fin = lineas.slice(0, 6).findIndex((l) => PREAMBULO.test(l) && !ARTICULO.test(l));
  if (fin >= 0) {
    const resto = PREAMBULO.exec(lineas[fin]!)![1]!.trim();
    lineas = [...(resto ? [resto] : []), ...lineas.slice(fin + 1)];
  }

  // Cierre: "DADA EN EL RECINTO DE SESIONES…" y las firmas.
  let cierre: LeyCierre | null = null;
  const iDada = lineas.findIndex((l) => /^DAD[AO]\s+EN\b/i.test(l));
  if (iDada >= 0) {
    // "Dada en…" puede venir partida en varias líneas: se junta hasta el punto final.
    let fin = iDada;
    while (fin < lineas.length - 1 && !/\.\s*$/.test(lineas[fin]!) && !esMayusculas(lineas[fin + 1]!)) fin++;
    const dada = lineas.slice(iDada, fin + 1).join(" ").toLowerCase().replace(/\bmendoza\b/g, "Mendoza").replace(/[\s,.]+$/, "");
    const firmantes: string[] = [];
    for (const l of lineas.slice(fin + 1)) {
      if (firmantes.length >= 8 || l.length > 60 || /\d|ANEXO/i.test(l) || !esMayusculas(l)) break;
      firmantes.push(nombrePropio(l));
    }
    cierre = { dada: `${dada.charAt(0).toUpperCase()}${dada.slice(1)}.`, firmantes };
    lineas = lineas.slice(0, iDada);
  }

  const bloques: LeyBloque[] = [];
  let encabezado: string | null = null;
  for (const l of lineas) {
    const art = ARTICULO.exec(l);
    if (art) {
      const textoArt = art[2]!.trim();
      if (TRAMITE.test(textoArt)) continue;
      // "ART. 1 OBJETO: El objeto…" → artículo con título "Objeto".
      const rotulo = /^([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ ,]{2,60})[:.-]\s+(.*)$/.exec(textoArt);
      bloques.push({
        tipo: "articulo",
        numero: art[1]!,
        ...(rotulo ? { titulo: oracion(rotulo[1]!.trim()) } : {}),
        parrafos: rotulo ? [rotulo[2]!] : textoArt ? [textoArt] : [],
      });
      continue;
    }
    if (SECCION.test(l) || (esMayusculas(l) && l.length <= 120)) {
      const t = oracion(l.replace(/\s*[-–—]\s*/, " · ").replace(/\s+·\s+/, " · "));
      // El nombre de la ley puede venir en varias líneas en mayúsculas antes del primer artículo.
      if (!bloques.length && !SECCION.test(l)) encabezado = encabezado ? `${encabezado} ${t.charAt(0).toLowerCase()}${t.slice(1)}` : t;
      else bloques.push({ tipo: "seccion", texto: t });
      continue;
    }
    const ultimo = bloques.at(-1);
    if (ultimo?.tipo === "articulo") ultimo.parrafos.push(l);
    else bloques.push({ tipo: "parrafo", texto: l });
  }
  return { encabezado, bloques, cierre };
}

/** "La presente Ley establece el Régimen…" → "Régimen…" */
function temaDeArticulo(t: string): string {
  const limpio = t
    .replace(/^(?:la presente ley|por la presente(?: ley)?|esta ley)\s+(?:tiene por objeto|establece|crea|regula|declara|aprueba|dispone)\s+(?:(?:el|la|los|las)\s+)?/i, "")
    .replace(/^(?:tiene por objeto)\s+/i, "");
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

const recortar = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, "").replace(/[\s,.;:]+$/, "")}…`);

/** Título para mostrar: el curado, el nombre que se da la ley o, si no, su primer artículo. */
export function tituloLey(curado: ResumenLey | undefined, ley: LeyEstructurada, respaldo: string): string {
  if (curado?.titulo) return curado.titulo;
  if (ley.encabezado) return ley.encabezado;
  const primero = ley.bloques.find((b) => b.tipo === "articulo");
  const base = primero?.tipo === "articulo" && primero.parrafos[0] ? primero.parrafos[0] : respaldo;
  const sinPreambulo = PREAMBULO.exec(base)?.[1] ?? base;
  const sinArticulo = ARTICULO.exec(sinPreambulo.trim())?.[2] ?? sinPreambulo;
  return recortar(temaDeArticulo(sinArticulo.trim()), 120);
}
