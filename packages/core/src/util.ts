/**
 * Utilidades chicas que repetían casi todos los scrapers. Antes de escribir una función auxiliar en un
 * scraper, buscar acá: cada copia de más es código que el próximo agente tiene que leer.
 */

/** Pausa entre pedidos, para no saturar los servidores. */
export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Junta los espacios, tabulaciones y saltos de línea seguidos en un solo espacio y recorta los bordes. */
export const collapseSpaces = (s: string) => s.replace(/\s+/g, " ").trim();

/** El número tal cual si la celda ya es un número finito; si no, null. Para celdas de planillas. */
export const finiteNumber = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Número escrito en formato argentino: punto de miles y coma decimal ("1.234,56" → 1234.56). */
export const parseArNumber = (s: string) => Number(s.replaceAll(".", "").replace(",", "."));
