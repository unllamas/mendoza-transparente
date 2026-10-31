/** Cifras principales para el inicio: un solo archivo con todo lo que muestra la portada. */

import type { CoparticipacionTema, DeudaTema, EmpleoTema, HomeTema, NoPublicado, PoblacionTema } from "../../src/types.ts";

type CsvRow = Record<string, string>;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function buildHome(input: {
  deuda?: DeudaTema;
  coparticipacion?: CoparticipacionTema;
  empleo?: EmpleoTema;
  poblacion?: PoblacionTema;
  procesos?: CsvRow[];
  adjudicaciones?: CsvRow[];
  normas?: CsvRow[];
  ipc?: CsvRow[];
  dolar?: CsvRow[];
  noPublicado?: NoPublicado[];
}): HomeTema {
  const home: HomeTema = {};
  const { deuda, coparticipacion, empleo, poblacion, procesos, adjudicaciones, normas, ipc, dolar, noPublicado } = input;

  if (noPublicado?.length) {
    home.noPublicado = {
      total: noPublicado.length,
      primeros: noPublicado.slice(0, 4).map(({ id, titulo, organismo }) => ({ id, titulo, organismo })),
    };
  }

  if (deuda) {
    home.deuda = {
      totalUsd: deuda.totalUsd,
      porHabitanteUsd: deuda.porHabitanteUsd,
      corte: deuda.corte,
      maximo: deuda.serie.reduce((m, p) => (p.usd > m.usd ? p : m)),
      serie: deuda.serie.map((p) => p.usd),
    };
  }
  if (coparticipacion) {
    const top = [...coparticipacion.municipios].sort((a, b) => b.perCapita - a.perCapita)[0]!;
    home.coparticipacion = {
      totalReal: coparticipacion.totalReal,
      anio: coparticipacion.anioCompleto,
      referencia: coparticipacion.referencia,
      top: { municipio: top.municipio, perCapita: top.perCapita },
      serie: coparticipacion.provincia.filter((p) => !p.parcial && p.anio >= 2010).map((p) => p.real),
      porMunicipio: Object.fromEntries(coparticipacion.municipios.map((m) => [m.municipio, m.perCapita])),
    };
  }
  if (empleo) {
    home.empleo = {
      cadaMil: empleo.cadaMilMendoza,
      promedioPais: empleo.promedioPais,
      posicion: empleo.posicion,
      anio: empleo.anio,
      serie: empleo.serie.filter((p) => p.anio >= 2005).map((p) => p.cadaMil),
    };
  }
  if (poblacion) {
    home.poblacion = {
      actual: poblacion.actual,
      anio: poblacion.anioActual,
      variacionCensos: (poblacion.censo2022 / poblacion.censo2010 - 1) * 100,
      serie: poblacion.serie.filter((p) => !p.proyectado).map((p) => p.poblacion),
    };
  }
  if (procesos && adjudicaciones) {
    const directas = procesos.filter((p) => /directa/i.test(p.metodo_contratacion ?? ""));
    const conOferentes = procesos.filter((p) => p.cantidad_oferentes !== "");
    const unaOferta = conOferentes.filter((p) => p.cantidad_oferentes === "1");
    const porOcid = new Map(procesos.map((p) => [p.ocid!, p]));
    let total = 0;
    let totalDirectas = 0;
    const porAnio = new Map<string, number>();
    for (const a of adjudicaciones) {
      const monto = Number(a.monto) || 0;
      total += monto;
      if (/directa/i.test(porOcid.get(a.ocid!)?.metodo_contratacion ?? "")) totalDirectas += monto;
      const anio = (a.fecha_adjudicacion || "").slice(0, 4);
      if (anio) porAnio.set(anio, (porAnio.get(anio) ?? 0) + monto);
    }
    const fechas = procesos
      .map((p) => p.fecha!)
      .filter(Boolean)
      .sort();
    home.compras = {
      procesos: procesos.length,
      proveedores: new Set(adjudicaciones.map((a) => a.proveedor_cuit)).size,
      totalAdjudicado: total,
      pctDirectas: (directas.length / procesos.length) * 100,
      pctMontoDirectas: (totalDirectas / total) * 100,
      pctUnaOferta: (unaOferta.length / conOferentes.length) * 100,
      desde: fechas[0]!,
      hasta: fechas.at(-1)!,
      serie: [...porAnio].sort().map(([, v]) => v),
    };
  }
  if (normas?.length) {
    const fechas = normas.map((n) => n.fecha!).sort();
    home.boletin = {
      normas: normas.length,
      designaciones: normas.filter((n) => n.categoria === "designacion").length,
      contrataciones: normas.filter((n) => n.categoria === "contratacion").length,
      presupuesto: normas.filter((n) => n.categoria === "presupuesto").length,
      desde: fechas[0]!,
      hasta: fechas.at(-1)!,
    };
  }
  if (ipc) {
    const cuyo = ipc
      .filter((r) => r.region === "cuyo")
      .sort((a, b) => Number(a.anio) * 12 + Number(a.mes) - (Number(b.anio) * 12 + Number(b.mes)));
    const ultimo = cuyo.at(-1);
    const haceUnAnio = cuyo.at(-13);
    if (ultimo && haceUnAnio) {
      home.inflacion = {
        mensual: Number(ultimo.variacion_mensual),
        interanual: (Number(ultimo.indice) / Number(haceUnAnio.indice) - 1) * 100,
        periodo: `${MESES[Number(ultimo.mes) - 1]} ${ultimo.anio}`,
        serie: cuyo.slice(-24).map((r) => Number(r.variacion_mensual)),
      };
    }
  }
  if (dolar?.length) {
    const ultimo = dolar.at(-1)!;
    home.dolar = {
      oficial: Number(ultimo.tipo_cambio_oficial_promedio),
      periodo: `${MESES[Number(ultimo.mes) - 1]} ${ultimo.anio}`,
    };
  }
  return home;
}
