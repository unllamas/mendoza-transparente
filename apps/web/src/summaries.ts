/**
 * Resumen de cada ficha en una o dos oraciones, armado con el dato real: «CAMILETTI S.A. ganó $ 544,3 millones…».
 *
 * Lo usan las dos versiones de la página, para que digan lo mismo:
 * - `scripts/paginas.ts`, en el HTML prerenderizado, la descripción y el JSON-LD;
 * - la ficha en React, debajo del título. React reemplaza el HTML prerenderizado al cargar, y Google lee la página ya
 *   cargada: sin esta oración, lo único que veía eran cifras sueltas con su etiqueta.
 *
 * Solo hechos con su número, sin adjetivos (ver `docs/procesos/metodologia.md`).
 */
import type { Funcionario } from "./types.ts";

const nf = new Intl.NumberFormat("es-AR");
const nf1 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

/** Monto en pesos para leer en una oración: «$ 544,3 millones», «$ 1,2 mil millones». */
export function pesosText(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$ ${nf1.format(v / 1e9)} mil millones`;
  if (abs >= 1e6) return `$ ${nf1.format(v / 1e6)} millones`;
  return `$ ${nf.format(Math.round(v))}`;
}

const plural = (n: number, one: string, many: string) => `${nf.format(n)} ${n === 1 ? one : many}`;
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Qué cargo tiene, en minúscula para ir en medio de una oración: «intendente de Maipú», «diputado/a provincial». */
export function officialPlace(p: Pick<Funcionario, "grupo" | "organismo" | "cargo">): string {
  return p.grupo === "intendentes" ? `intendente de ${p.organismo}` : lowerFirst(p.cargo.replace(/\s*\(.*\)$/, ""));
}

/**
 * El cargo como predicado de la oración: «es intendente de Maipú», «es ministro de Hacienda y Finanzas de Mendoza».
 * Los cargos que la fuente escribe con barra («Diputado/a provincial») se dicen por la cámara que integran, para no
 * escribir el género con barra: «integra la Cámara de Diputados de Mendoza».
 */
function officialRole(p: Pick<Funcionario, "grupo" | "organismo" | "cargo">): string {
  if (p.grupo !== "intendentes" && p.cargo.includes("/")) return `integra ${p.organismo.startsWith("Senado") ? "el" : "la"} ${p.organismo}`;
  const place = officialPlace(p).replace(/ de la cámara$/i, ` de la ${p.organismo}`);
  const inMendoza = p.grupo === "intendentes" || p.grupo.endsWith("nacional") || place.includes("Mendoza");
  return `es ${place}${inMendoza ? "" : " de Mendoza"}`;
}

/** Quién es, qué declaró y cuánto cobra. */
export function officialSummary(
  p: Pick<Funcionario, "nombre" | "grupo" | "organismo" | "cargo" | "partido" | "bloque" | "mandatoHasta" | "ddjj" | "remuneracion">,
): string {
  const filiacion = p.partido ?? p.bloque;
  const quien = `${p.nombre} ${officialRole(p)}${filiacion ? ` (${filiacion})` : ""}${p.mandatoHasta ? `, con mandato hasta ${p.mandatoHasta}` : ""}.`;
  // Solo lo que declaró: «(1 vehículo)», no «(0 inmuebles y 1 vehículo)».
  const items = p.ddjj
    ? [
        p.ddjj.inmuebles ? plural(p.ddjj.inmuebles, "inmueble", "inmuebles") : null,
        p.ddjj.rodados ? plural(p.ddjj.rodados, "vehículo", "vehículos") : null,
      ].filter(Boolean)
    : [];
  const bienes = p.ddjj
    ? `Declaró inmuebles y vehículos a su nombre por ${pesosText(p.ddjj.totalBienes)} a valor fiscal${items.length ? ` (${items.join(" y ")})` : ""}.`
    : "";
  const sueldo = p.remuneracion.length ? `Cobra ${pesosText(p.remuneracion[0]!.monto)} brutos por mes.` : "Su sueldo no está publicado.";
  return [quien, bienes, sueldo].filter(Boolean).join(" ");
}

/** Cuánto le vendió al Estado, en cuántos procesos y años, y qué empresa es. */
export function supplierSummary(p: {
  name: string;
  total: number;
  processes: number;
  first: string | null;
  last: string | null;
  companyType: string | null;
  place: string | null;
  activity: string | null;
  /**
   * Organismo que más le compró y qué parte del total (de 0 a 100). Solo lo tiene la ficha completa
   * (`ProveedorDetalle`): el HTML prerenderizado sale del resumen y no lo lleva.
   */
  mainBuyer?: { name: string; pct: number } | null;
}): string {
  const first = p.first?.slice(0, 4);
  const last = p.last?.slice(0, 4);
  const years = first && last ? (first === last ? ` en ${first}` : ` entre ${first} y ${last}`) : "";
  const who = [p.companyType, p.place ? `de ${p.place}` : null, p.activity ? `(${p.activity.toLowerCase()})` : null]
    .filter(Boolean)
    .join(" ");
  return [
    `${p.name} ganó ${pesosText(p.total)} en contrataciones con el Estado de Mendoza en ${plural(p.processes, "proceso", "procesos")}${years}.`,
    who ? `Es una ${who}.` : "",
    p.mainBuyer ? `Su principal comprador es ${p.mainBuyer.name} (${Math.round(p.mainBuyer.pct)} % del total).` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Cuánto compró, cómo y a quién le compró más. */
export function agencySummary(o: {
  name: string;
  total: number;
  processes: number;
  pctDirect: number;
  pctOneOffer: number;
  mainSupplier: { nombre: string; pct: number } | null;
}): string {
  return [
    `${o.name} adjudicó ${pesosText(o.total)} en ${plural(o.processes, "proceso", "procesos")} de compra.`,
    `El ${Math.round(o.pctDirect)} % fueron contrataciones directas y el ${Math.round(o.pctOneOffer)} % recibió una sola oferta.`,
    o.mainSupplier ? `Su principal proveedor es ${o.mainSupplier.nombre} (${Math.round(o.mainSupplier.pct)} % del total).` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
