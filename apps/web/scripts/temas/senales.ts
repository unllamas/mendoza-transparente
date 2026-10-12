/**
 * Señales para mirar de cerca: patrones en los datos oficiales que merecen una explicación.
 * No son acusaciones. Cada señal dice cómo se calculó y lista los casos concretos.
 */

import type { Caso, Senal, SenalesTema } from "../../src/types.ts";

type CsvRow = Record<string, string>;

const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);
const esDirecta = (p?: CsvRow) => /directa/i.test(p?.metodo_contratacion ?? "");
const limpiar = (s: string) => s.replace(/^[\d-]+\s*-\s*/, "").trim();

export function buildSenales(procesos: CsvRow[], adjudicaciones: CsvRow[], proveedores: CsvRow[]): SenalesTema {
  const porOcid = new Map(procesos.map((p) => [p.ocid!, p]));
  const montoPorOcid = new Map<string, number>();
  const proveedoresPorOcid = new Map<string, string[]>();
  for (const a of adjudicaciones) {
    montoPorOcid.set(a.ocid!, (montoPorOcid.get(a.ocid!) ?? 0) + (Number(a.monto) || 0));
    proveedoresPorOcid.set(a.ocid!, [...(proveedoresPorOcid.get(a.ocid!) ?? []), a.proveedor_nombre!]);
  }
  const totalAdjudicado = [...montoPorOcid.values()].reduce((s, v) => s + v, 0);

  const casoProceso = (ocid: string, extra?: string): Caso => {
    const p = porOcid.get(ocid);
    const provs = [...new Set(proveedoresPorOcid.get(ocid) ?? [])];
    return {
      tipo: "proceso",
      id: ocid,
      titulo: p?.titulo?.trim() || "Sin título",
      detalle: [limpiar(p?.comprador ?? ""), provs.length ? provs.slice(0, 2).join(", ") + (provs.length > 2 ? "…" : "") : null, extra]
        .filter(Boolean)
        .join(" · "),
      monto: montoPorOcid.get(ocid) ?? (Number(p?.monto_estimado) || null),
      fecha: p?.fecha || null,
    };
  };

  const senales: Senal[] = [];
  const ultimaFecha = procesos.map((p) => p.fecha!).filter(Boolean).sort().at(-1)!;

  // 1. Contratación directa
  const directas = procesos.filter((p) => esDirecta(p));
  const montoDirectas = directas.reduce((s, p) => s + (montoPorOcid.get(p.ocid!) ?? 0), 0);
  const directasGrandes = directas
    .filter((p) => montoPorOcid.has(p.ocid!))
    .sort((a, b) => montoPorOcid.get(b.ocid!)! - montoPorOcid.get(a.ocid!)!)
    .slice(0, 15)
    .map((p) => casoProceso(p.ocid!));
  senales.push({
    id: "contratacion-directa",
    tema: "Compras",
    cifra: `${Math.round(pct(directas.length, procesos.length))} %`,
    titulo: "de los procesos de compra se hicieron por contratación directa, sin licitación",
    matiz: `Representan el ${Math.round(pct(montoDirectas, totalAdjudicado))} % de la plata adjudicada: muchas son compras chicas, que la ley permite hacer así. Las grandes son las que conviene mirar.`,
    porQueImporta:
      "La licitación obliga a competir y a publicar. La contratación directa es legal para montos chicos o urgencias, pero cuando se usa para contratos grandes hay menos competencia y menos control.",
    metodo: `Procesos de COMPR.AR Mendoza con modalidad «Contratación Directa», sobre ${procesos.length.toLocaleString("es-AR")} procesos entre 2020 y ${ultimaFecha.slice(0, 4)}. Montos adjudicados nominales.`,
    casosTitulo: "Las contrataciones directas más grandes",
    casos: directasGrandes,
  });

  // 2. Una sola oferta
  const conOferentes = procesos.filter((p) => p.cantidad_oferentes !== "" && p.cantidad_oferentes !== undefined);
  const unaOferta = conOferentes.filter((p) => p.cantidad_oferentes === "1");
  const montoUnaOferta = unaOferta.reduce((s, p) => s + (montoPorOcid.get(p.ocid!) ?? 0), 0);
  senales.push({
    id: "una-sola-oferta",
    tema: "Compras",
    cifra: `1 de cada ${Math.round(100 / pct(unaOferta.length, conOferentes.length))}`,
    titulo: "procesos de compra recibió una sola oferta",
    matiz: `Son ${unaOferta.length.toLocaleString("es-AR")} procesos, por un total adjudicado de $ ${Math.round(montoUnaOferta / 1e6).toLocaleString("es-AR")} millones.`,
    porQueImporta:
      "Sin competencia, el Estado no puede comparar precios. Puede deberse a rubros muy específicos, pero también a pliegos armados a medida o a poca difusión del llamado.",
    metodo: "Procesos con el dato de cantidad de oferentes informado en el estándar de contrataciones abiertas (OCDS) de COMPR.AR Mendoza.",
    casosTitulo: "Los procesos con una sola oferta de mayor monto",
    casos: unaOferta
      .filter((p) => montoPorOcid.has(p.ocid!))
      .sort((a, b) => montoPorOcid.get(b.ocid!)! - montoPorOcid.get(a.ocid!)!)
      .slice(0, 15)
      .map((p) => casoProceso(p.ocid!, p.metodo_contratacion)),
  });

  // 3. Empresas nuevas
  const empresa = new Map(proveedores.map((e) => [e.cuit!, e]));
  const porCuit = new Map<string, CsvRow[]>();
  for (const a of adjudicaciones) if (a.proveedor_cuit) porCuit.set(a.proveedor_cuit, [...(porCuit.get(a.proveedor_cuit) ?? []), a]);
  const nuevas: (Caso & { meses: number })[] = [];
  for (const [cuit, filas] of porCuit) {
    const e = empresa.get(cuit);
    if (!e?.fecha_constitucion || e.tipo_persona !== "juridica") continue;
    const primera = filas.map((a) => a.fecha_adjudicacion!).filter(Boolean).sort()[0];
    if (!primera) continue;
    const meses = Math.floor((Date.parse(primera) - Date.parse(e.fecha_constitucion)) / (30.44 * 24 * 3600 * 1000));
    if (meses < 0 || meses >= 12) continue;
    nuevas.push({
      tipo: "proveedor",
      id: cuit,
      titulo: e.razon_social || filas[0]!.proveedor_nombre!,
      detalle: `Constituida en ${e.fecha_constitucion.slice(0, 7)} · primera adjudicación a los ${meses} ${meses === 1 ? "mes" : "meses"}${e.actividad ? ` · ${e.actividad}` : ""}`,
      monto: filas.reduce((s, a) => s + (Number(a.monto) || 0), 0),
      fecha: primera,
      meses,
    });
  }
  nuevas.sort((a, b) => (b.monto ?? 0) - (a.monto ?? 0));
  senales.push({
    id: "empresas-nuevas",
    tema: "Proveedores",
    cifra: String(nuevas.length),
    titulo: "empresas ganaron su primera adjudicación antes de cumplir un año de vida",
    matiz: `Entre todas suman $ ${Math.round(nuevas.reduce((s, c) => s + (c.monto ?? 0), 0) / 1e6).toLocaleString("es-AR")} millones adjudicados.`,
    porQueImporta:
      "Una empresa recién creada puede ser un emprendimiento legítimo, pero también es uno de los patrones que los organismos de control usan para detectar sociedades armadas para un contrato.",
    metodo:
      "Fecha de constitución del Registro Nacional de Sociedades (Ministerio de Justicia, con datos de ARCA) comparada con la primera adjudicación de cada CUIT en COMPR.AR. Solo personas jurídicas.",
    casosTitulo: "Empresas nuevas con adjudicaciones",
    casos: nuevas.map(({ meses: _, ...c }) => c),
  });

  // 4. Concentración: un proveedor se lleva más de la mitad de lo que compra un organismo
  const porComprador = new Map<string, Map<string, { nombre: string; monto: number }>>();
  for (const a of adjudicaciones) {
    const comprador = porOcid.get(a.ocid!)?.comprador;
    if (!comprador || !a.proveedor_cuit) continue;
    const m = porComprador.get(comprador) ?? new Map();
    const prev = m.get(a.proveedor_cuit) ?? { nombre: a.proveedor_nombre!, monto: 0 };
    prev.monto += Number(a.monto) || 0;
    m.set(a.proveedor_cuit, prev);
    porComprador.set(comprador, m);
  }
  const concentrados: Caso[] = [];
  for (const [comprador, provs] of porComprador) {
    const total = [...provs.values()].reduce((s, p) => s + p.monto, 0);
    if (provs.size < 3 || total < 500e6) continue; // organismos con compras relevantes y varios proveedores
    const [cuit, top] = [...provs].sort((a, b) => b[1].monto - a[1].monto)[0]!;
    const share = pct(top.monto, total);
    if (share < 50) continue;
    concentrados.push({
      tipo: "proveedor",
      id: cuit,
      titulo: `${limpiar(comprador)}`,
      detalle: `${top.nombre} se llevó el ${Math.round(share)} % de lo que compró este organismo`,
      monto: top.monto,
      fecha: null,
    });
  }
  concentrados.sort((a, b) => (b.monto ?? 0) - (a.monto ?? 0));
  senales.push({
    id: "concentracion",
    tema: "Compras",
    cifra: String(concentrados.length),
    titulo: "organismos le compraron más de la mitad de todo a un solo proveedor",
    matiz: "Solo se cuentan organismos con más de $ 500 millones adjudicados y al menos tres proveedores.",
    porQueImporta:
      "Cuando un proveedor concentra casi todo lo que compra un organismo, el Estado depende de él para negociar precios. A veces se explica por un servicio único (por ejemplo, la comida de un hospital), pero vale la pena preguntar.",
    metodo: "Suma de montos adjudicados por organismo comprador y proveedor en COMPR.AR Mendoza, 2020 a enero de 2026.",
    casosTitulo: "Organismos con un proveedor dominante",
    casos: concentrados.slice(0, 20),
  });

  // 5. Procesos fracasados o desiertos
  const fracasados = procesos.filter((p) => p.estado === "unsuccessful");
  senales.push({
    id: "fracasados",
    tema: "Compras",
    cifra: `1 de cada ${Math.round(100 / pct(fracasados.length, procesos.length))}`,
    titulo: "procesos de compra terminó desierto o fracasado",
    matiz: `Son ${fracasados.length.toLocaleString("es-AR")} procesos que no se adjudicaron: hay que volver a empezar.`,
    porQueImporta:
      "Cada proceso que fracasa demora la compra y obliga a repetir el trámite, muchas veces por contratación directa. Un porcentaje alto puede indicar pliegos mal armados o precios de referencia irreales.",
    metodo: "Procesos con estado «unsuccessful» (desierto o fracasado) en el estándar OCDS de COMPR.AR Mendoza.",
    casosTitulo: "Procesos fracasados más recientes",
    casos: fracasados
      .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""))
      .slice(0, 15)
      .map((p) => casoProceso(p.ocid!)),
  });

  // 6. Datos desactualizados
  const mesesAtraso = Math.floor((Date.now() - Date.parse(ultimaFecha)) / (30.44 * 24 * 3600 * 1000));
  senales.push({
    id: "datos-desactualizados",
    tema: "Transparencia",
    cifra: `${mesesAtraso} meses`,
    titulo: "sin datos abiertos de las compras del Estado",
    matiz: `El último archivo publicado de COMPR.AR llega al ${ultimaFecha.split("-").reverse().join("/")}. Todo lo que se compró después no se puede analizar.`,
    porQueImporta:
      "Sin datos actualizados no hay control ciudadano a tiempo: los patrones de esta página solo se pueden detectar meses después, cuando ya no hay margen para corregir.",
    metodo: "Fecha del último proceso incluido en el conjunto de datos de contrataciones abiertas publicado por el Gobierno de Mendoza.",
    casosTitulo: "",
    casos: [],
    pedido: "compras-2026",
  });

  return { generado: new Date().toISOString(), senales };
}
