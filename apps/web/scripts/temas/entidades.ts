/**
 * Entidades con página propia: municipios, organismos compradores, proveedores y leyes.
 * Cada una tiene un índice (para listados, sitemap y SEO) y, si hace falta, un archivo de detalle.
 * Solo tienen página las que superan un umbral de contenido (ver docs/procesos/web.md#seo-y-geo).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { SECCION_ELECTORAL, slug, slugProveedor } from "../../src/slug.ts";
import type {
  CoparticipacionTema,
  FuncionariosTema,
  LeyDetalle,
  LeyResumen,
  MunicipioPagina,
  OrganismoDetalle,
  OrganismoResumen,
  PoblacionTema,
  ProveedorResumen,
} from "../../src/types.ts";
import type { Deflactor } from "./inflacion.ts";
import { estructurarLey, tituloLey, type ResumenLey } from "./leyes.ts";

type CsvRow = Record<string, string>;

const limpiarOrganismo = (s: string) =>
  s
    .replace(/^[\d-]+\s*-\s*/, "")
    .replace(/\bD(?:cci[oó]n|cc|ir)\.\s*/gi, "Dirección ")
    .replace(/\bGral\.\s*/gi, "General ")
    .replace(/\s+/g, " ")
    .trim();

/** Umbrales para que una entidad tenga página indexable (contenido suficiente, sin páginas vacías). */
export const UMBRAL = { proveedorMonto: 100e6, proveedorProcesos: 3, organismoProcesos: 20 };

// ------------------------------------------------------------------ municipios

export function buildMunicipios(
  copa: CoparticipacionTema,
  poblacion: PoblacionTema,
  funcionarios: FuncionariosTema,
): MunicipioPagina[] {
  const ranking = [...copa.municipios].sort((a, b) => b.perCapita - a.perCapita);
  const porPoblacion = [...poblacion.departamentos].sort((a, b) => b.actual - a.actual);
  return poblacion.departamentos.map((d) => {
    const c = copa.municipios.find((m) => m.municipio === d.municipio);
    const intendente = funcionarios.personas.find((p) => p.grupo === "intendentes" && p.organismo === d.municipio) ?? null;
    const seccion = SECCION_ELECTORAL[d.municipio] ?? null;
    const legisladores = funcionarios.personas
      .filter((p) => (p.grupo === "diputados_provincial" || p.grupo === "senado_provincial") && seccion && p.seccion?.startsWith(seccion))
      .map((p) => ({ id: p.id, role: p.role, slug: p.slug, nombre: p.nombre, cargo: p.cargo, bloque: p.bloque, foto: p.foto }));
    return {
      slug: slug(d.municipio),
      nombre: d.municipio,
      intendente: intendente && {
        id: intendente.id,
        role: intendente.role,
        slug: intendente.slug,
        nombre: intendente.nombre,
        partido: intendente.partido,
        foto: intendente.foto,
        mandatoHasta: intendente.mandatoHasta,
      },
      poblacion: {
        actual: d.actual,
        censo2010: d.censo2010,
        censo2022: d.censo2022,
        variacion: d.variacion,
        puesto: porPoblacion.findIndex((x) => x.municipio === d.municipio) + 1,
        serie: d.serie,
      },
      coparticipacion: c
        ? {
            anio: copa.anioCompleto,
            referencia: copa.referencia,
            perCapita: c.perCapita,
            real: c.real,
            puesto: ranking.findIndex((x) => x.municipio === d.municipio) + 1,
            serie: c.serie.filter((p) => p.perCapita !== null && !p.parcial).map((p) => ({ anio: p.anio, perCapita: p.perCapita! })),
          }
        : null,
      seccion,
      legisladores,
    };
  });
}

// ------------------------------------------------------------------ compras: organismos y proveedores

export function buildOrganismosYProveedores(
  procesos: CsvRow[],
  adjudicaciones: CsvRow[],
  empresas: CsvRow[],
  inflacion: Deflactor | null,
  outDir: string,
): { organismos: OrganismoResumen[]; proveedores: ProveedorResumen[] } {
  const porOcid = new Map(procesos.map((p) => [p.ocid!, p]));
  const empresa = new Map(empresas.map((e) => [e.cuit!, e]));
  const real = (monto: number, fecha: string) => (inflacion ? inflacion.aReal(monto, Number(fecha.slice(0, 4))) : monto);

  // Proveedores (solo personas jurídicas: a las personas humanas no se las perfila)
  const porCuit = new Map<string, CsvRow[]>();
  for (const a of adjudicaciones) if (a.proveedor_cuit) porCuit.set(a.proveedor_cuit, [...(porCuit.get(a.proveedor_cuit) ?? []), a]);
  const proveedores: ProveedorResumen[] = [];
  for (const [cuit, filas] of porCuit) {
    const e = empresa.get(cuit);
    if (e?.tipo_persona !== "juridica") continue;
    const total = filas.reduce((s, a) => s + (Number(a.monto) || 0), 0);
    const nProcesos = new Set(filas.map((a) => a.ocid)).size;
    const nombre = e.razon_social || filas.at(-1)!.proveedor_nombre!;
    const fechas = filas.map((a) => a.fecha_adjudicacion!).filter(Boolean).sort();
    proveedores.push({
      slug: slugProveedor(nombre, cuit),
      cuit,
      nombre,
      total,
      procesos: nProcesos,
      primera: fechas[0] ?? null,
      ultima: fechas.at(-1) ?? null,
      tipoSocietario: e.tipo_societario || null,
      localidad: [e.localidad, e.provincia].filter(Boolean).join(", ") || null,
      actividad: e.actividad || null,
      indexable: total >= UMBRAL.proveedorMonto && nProcesos >= UMBRAL.proveedorProcesos,
    });
  }
  proveedores.sort((a, b) => b.total - a.total);
  const slugDeCuit = new Map(proveedores.filter((p) => p.indexable).map((p) => [p.cuit, p.slug]));

  // Organismos compradores
  const porComprador = new Map<string, CsvRow[]>();
  for (const p of procesos) if (p.comprador) porComprador.set(p.comprador, [...(porComprador.get(p.comprador) ?? []), p]);
  const adjPorOcid = new Map<string, CsvRow[]>();
  for (const a of adjudicaciones) adjPorOcid.set(a.ocid!, [...(adjPorOcid.get(a.ocid!) ?? []), a]);

  mkdirSync(join(outDir, "organismos"), { recursive: true });
  const organismos: OrganismoResumen[] = [];
  const slugsUsados = new Set<string>();
  for (const [comprador, procs] of porComprador) {
    if (procs.length < UMBRAL.organismoProcesos) continue;
    const nombre = limpiarOrganismo(comprador);
    let s = slug(nombre);
    while (slugsUsados.has(s)) s = `${s}-2`;
    slugsUsados.add(s);
    const adjs = procs.flatMap((p) => adjPorOcid.get(p.ocid!) ?? []);
    const total = adjs.reduce((acc, a) => acc + (Number(a.monto) || 0), 0);
    const directas = procs.filter((p) => /directa/i.test(p.metodo_contratacion ?? ""));
    const conOferentes = procs.filter((p) => p.cantidad_oferentes !== "");
    const unaOferta = conOferentes.filter((p) => p.cantidad_oferentes === "1");
    const provMap = new Map<string, { nombre: string; monto: number; procesos: Set<string> }>();
    for (const a of adjs) {
      if (!a.proveedor_cuit) continue;
      const v = provMap.get(a.proveedor_cuit) ?? { nombre: a.proveedor_nombre!, monto: 0, procesos: new Set<string>() };
      v.monto += Number(a.monto) || 0;
      v.procesos.add(a.ocid!);
      provMap.set(a.proveedor_cuit, v);
    }
    const porAnioMap = new Map<number, { monto: number; real: number }>();
    for (const a of adjs) {
      const fecha = a.fecha_adjudicacion || porOcid.get(a.ocid!)?.fecha || "";
      if (!fecha) continue;
      const anio = Number(fecha.slice(0, 4));
      const v = porAnioMap.get(anio) ?? { monto: 0, real: 0 };
      v.monto += Number(a.monto) || 0;
      v.real += real(Number(a.monto) || 0, fecha);
      porAnioMap.set(anio, v);
    }
    const anios = [...porAnioMap.keys()];
    const porAnio = [];
    if (anios.length)
      for (let anio = Math.min(...anios); anio <= Math.max(...anios); anio++)
        porAnio.push({ anio, monto: porAnioMap.get(anio)?.monto ?? 0, real: porAnioMap.get(anio)?.real ?? 0 });
    const topProveedor = [...provMap].sort((a, b) => b[1].monto - a[1].monto)[0];

    const resumen: OrganismoResumen = {
      slug: s,
      nombre,
      procesos: procs.length,
      total,
      pctDirecta: (directas.length / procs.length) * 100,
      pctUnaOferta: conOferentes.length ? (unaOferta.length / conOferentes.length) * 100 : 0,
      proveedorPrincipal: topProveedor ? { nombre: topProveedor[1].nombre, pct: total ? (topProveedor[1].monto / total) * 100 : 0 } : null,
    };
    organismos.push(resumen);
    const detalle: OrganismoDetalle = {
      ...resumen,
      referenciaReal: inflacion?.referencia ?? null,
      porAnio,
      proveedores: [...provMap]
        .sort((a, b) => b[1].monto - a[1].monto)
        .slice(0, 15)
        .map(([cuit, v]) => ({ cuit, nombre: v.nombre, monto: v.monto, procesos: v.procesos.size, slug: slugDeCuit.get(cuit) ?? null })),
      recientes: procs
        .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""))
        .slice(0, 20)
        .map((p) => ({
          ocid: p.ocid!,
          titulo: p.titulo?.trim() || "Sin título",
          fecha: p.fecha || null,
          metodo: p.metodo_contratacion || "",
          estado: p.estado || "",
          monto: (adjPorOcid.get(p.ocid!) ?? []).reduce((acc, a) => acc + (Number(a.monto) || 0), 0) || null,
        })),
    };
    writeFileSync(join(outDir, "organismos", `${s}.json`), JSON.stringify(detalle));
  }
  organismos.sort((a, b) => b.total - a.total);
  return { organismos, proveedores };
}

// ------------------------------------------------------------------ leyes

const numeroLey = (n: string) => n.replace(/\D/g, "");

export function buildLeyes(normas: CsvRow[], textosDir: string, outDir: string, resumenes: ResumenLey[]): LeyResumen[] {
  mkdirSync(join(outDir, "leyes"), { recursive: true });
  const curado = new Map(resumenes.map((r) => [String(r.numero), r]));
  const vistas = new Set<string>();
  const leyes: LeyResumen[] = [];
  for (const n of normas.filter((x) => x.tipo === "ley").sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""))) {
    const numero = numeroLey(n.numero ?? "");
    if (!numero || vistas.has(numero)) continue;
    vistas.add(numero);
    const textoPath = join(textosDir, n.fecha ?? "", `${n.norma_id}.txt`);
    const texto = existsSync(textoPath) ? readFileSync(textoPath, "utf8").trim() : "";
    const estructura = estructurarLey(texto);
    const r = curado.get(numero);
    const resumen: LeyResumen = {
      numero,
      titulo: tituloLey(r, estructura, (n.titulo_ley || n.sumario || "").replace(/\s+/g, " ").trim()),
      tema: r?.tema ?? null,
      fecha: n.fecha_norma || n.fecha || null,
      publicada: n.fecha || null,
      boletin: n.nro_boletin || null,
      urlPdf: n.url_pdf || null,
    };
    leyes.push(resumen);
    const detalle: LeyDetalle = {
      ...resumen,
      ...estructura,
      resumen: r ? { texto: r.resumen, puntos: r.puntos ?? [] } : null,
    };
    writeFileSync(join(outDir, "leyes", `${numero}.json`), JSON.stringify(detalle));
  }
  return leyes.sort((a, b) => Number(b.numero) - Number(a.numero));
}
