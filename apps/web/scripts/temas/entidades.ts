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
  MunicipalStaff,
  MunicipioPagina,
  OrganismoDetalle,
  OrganismoResumen,
  PoblacionTema,
  ProveedorResumen,
} from "../../src/types.ts";
import { quarterlyChange } from "./gobierno.ts";
import type { Deflactor } from "./inflacion.ts";
import { estructurarLey, type ResumenLey, tituloLey } from "./leyes.ts";
import { buildMunicipalTransparency, bulletinByMunicipality, declarationsByMunicipality, type TransparencySurvey } from "./transparency.ts";

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

/**
 * Staff per municipality from the Annex 19 rows (data/processed/municipios-personal/personal.csv): the latest
 * quarter, the quarterly series and staff per 1,000 inhabitants. Hours of teaching (horas cátedra) are hours,
 * not people, so they are left out of the totals.
 */
export function buildMunicipalStaff(rows: CsvRow[], population: Map<string, number>): Map<string, MunicipalStaff> {
  const byMunicipality = new Map<string, Map<string, CsvRow[]>>();
  for (const r of rows) {
    const key = r.fecha_corte!;
    const m = byMunicipality.get(r.municipio!) ?? new Map<string, CsvRow[]>();
    m.set(key, [...(m.get(key) ?? []), r]);
    byMunicipality.set(r.municipio!, m);
  }
  const count = (q: CsvRow[], type: string) => Number(q.find((r) => r.tipo_personal === type)?.cantidad ?? 0);
  const result = new Map<string, Omit<MunicipalStaff, "rank" | "withData">>();
  for (const [municipality, quarters] of byMunicipality) {
    const cutoffs = [...quarters.keys()].sort();
    const series = cutoffs.map((cutoff) => {
      const q = quarters.get(cutoff)!;
      const positions = count(q, "total_planta") || count(q, "permanente") + count(q, "temporaria");
      return {
        label: `${q[0]!.trimestre}T ${q[0]!.anio}`,
        period: `${q[0]!.anio}-T${q[0]!.trimestre}`,
        cutoff,
        positions,
        contracts: count(q, "contratos_locacion"),
      };
    });
    const latest = quarters.get(cutoffs.at(-1)!)!;
    const last = series.at(-1)!;
    const people = population.get(municipality);
    if (!people) continue;
    result.set(municipality, {
      quarter: `${latest[0]!.trimestre}.º trimestre de ${latest[0]!.anio}`,
      cutoff: cutoffs.at(-1)!,
      permanent: count(latest, "permanente"),
      temporary: count(latest, "temporaria"),
      positions: last.positions,
      contracts: last.contracts,
      perThousand: ((last.positions + last.contracts) / people) * 1000,
      series,
      // Quarters whose total the scraper had to add up from the rows are left out of the steps: one of them
      // (San Rafael, 2.º trimestre de 2024) counts subtotals twice and would read as the planta doubling.
      quarterlyChange: quarterlyChange(
        series.filter((s) => !quarters.get(s.cutoff)!.some((r) => /suma de sus filas/.test(r.observacion ?? ""))),
      ),
      sourceUrl: latest[0]!.fuente_url ?? "",
      // Notes about amounts are left out: the site shows people, not the amounts paid.
      note: latest.map((r) => r.observacion).find((o) => o && !/importe/i.test(o)) ?? null,
    });
  }
  const ranked = [...result].sort((a, b) => b[1].perThousand - a[1].perThousand);
  return new Map(ranked.map(([m, s], i) => [m, { ...s, rank: i + 1, withData: ranked.length }]));
}

export function buildMunicipios(
  copa: CoparticipacionTema,
  poblacion: PoblacionTema,
  funcionarios: FuncionariosTema,
  staffRows: CsvRow[] = [],
  surveys: TransparencySurvey[] = [],
  ethicsOfficials: CsvRow[] = [],
  bulletinNorms: CsvRow[] = [],
): MunicipioPagina[] {
  const staff = buildMunicipalStaff(staffRows, new Map(poblacion.departamentos.map((d) => [d.municipio, d.actual])));
  const names = poblacion.departamentos.map((d) => d.municipio);
  const yearBefore = (d?: string) => (d ? `${Number(String(d).slice(0, 4)) - 1}${String(d).slice(4, 10)}` : "");
  const transparency = buildMunicipalTransparency(
    surveys,
    staff,
    declarationsByMunicipality(ethicsOfficials, names),
    // The survey's day minus a year: every municipality is checked the same day.
    bulletinByMunicipality(bulletinNorms, names, yearBefore(surveys[0]?.fecha_verificacion)),
  );
  const ranking = [...copa.municipios].sort((a, b) => b.perCapita - a.perCapita);
  const porPoblacion = [...poblacion.departamentos].sort((a, b) => b.actual - a.actual);
  return poblacion.departamentos.map((d) => {
    const c = copa.municipios.find((m) => m.municipio === d.municipio);
    const intendente = funcionarios.personas.find((p) => p.grupo === "intendentes" && p.organismo === d.municipio) ?? null;
    const seccion = SECCION_ELECTORAL[d.municipio] ?? null;
    const legisladores = funcionarios.personas
      .filter((p) => (p.grupo === "diputados_provincial" || p.grupo === "senado_provincial") && seccion && p.seccion?.startsWith(seccion))
      .map((p) => ({
        id: p.id,
        role: p.role,
        slug: p.slug,
        nombre: p.nombre,
        cargo: p.cargo,
        bloque: p.bloque,
        party: p.party,
        foto: p.foto,
      }));
    return {
      slug: slug(d.municipio),
      nombre: d.municipio,
      intendente: intendente && {
        id: intendente.id,
        role: intendente.role,
        slug: intendente.slug,
        nombre: intendente.nombre,
        partido: intendente.partido,
        party: intendente.party,
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
      staff: staff.get(d.municipio) ?? null,
      transparency: transparency.get(d.municipio) ?? null,
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
    const fechas = filas
      .map((a) => a.fecha_adjudicacion!)
      .filter(Boolean)
      .sort();
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
      buyer: comprador,
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

/** "Hebe Casado" and "Hebe Silvina Casado" are the same person: every word of the shorter name is in the longer one. */
function samePerson(a: string, b: string): boolean {
  const words = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter(Boolean);
  const [x, y] = [words(a), words(b)].sort((p, q) => p.length - q.length);
  return x!.length >= 2 && x!.every((w) => y!.includes(w));
}

export function buildLeyes(
  normas: CsvRow[],
  textosDir: string,
  outDir: string,
  resumenes: ResumenLey[],
  officials: FuncionariosTema["personas"] = [],
): LeyResumen[] {
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
    const places = (r?.municipios ?? []).map((name) => ({ slug: slug(name), name }));
    const resumen: LeyResumen = {
      numero,
      titulo: tituloLey(r, estructura, (n.titulo_ley || n.sumario || "").replace(/\s+/g, " ").trim()),
      tema: r?.tema ?? null,
      fecha: n.fecha_norma || n.fecha || null,
      publicada: n.fecha || null,
      boletin: n.nro_boletin || null,
      urlPdf: n.url_pdf || null,
      municipios: places.map((p) => p.slug),
    };
    leyes.push(resumen);
    // Signers with their face and page when they are officials (vice governor, chamber presidents…).
    const signers = (estructura.cierre?.firmantes ?? []).map((name) => {
      const o = officials.find((p) => samePerson(name, p.nombre));
      return { name, photo: o?.foto ?? null, path: o ? `/funcionarios/${o.role}/${o.slug}` : null };
    });
    const detalle: LeyDetalle = {
      ...resumen,
      ...estructura,
      signers,
      resumen: r
        ? {
            texto: r.resumen,
            aQuien: r.a_quien ?? null,
            puntos: r.puntos ?? [],
            noDice: r.no_dice ?? [],
            revisado: r.revisado ? String(r.revisado) : null,
          }
        : null,
      places,
    };
    writeFileSync(join(outDir, "leyes", `${numero}.json`), JSON.stringify(detalle));
  }
  return leyes.sort((a, b) => Number(b.numero) - Number(a.numero));
}
