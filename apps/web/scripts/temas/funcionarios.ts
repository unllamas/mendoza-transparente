/** Quiénes representan a Mendoza: Ejecutivo, Legislatura, intendentes y Congreso nacional. */

import type { FuncionariosTema, Funcionario } from "../../src/types.ts";

type CsvRow = Record<string, string>;

const anio = (s: string) => (s ? s.slice(0, 4) : null);

/** "Janina Ortiz Suspendida Res.1135 (27/03/2024)" → nombre "Janina Ortiz" y nota "Suspendida Res.1135 (27/03/2024)". */
function separarNota(nombre: string): { nombre: string; nota: string | null } {
  const m = /\s+((?:Suspendid|Licencia|En uso de licencia|Renunci)[\s\S]*)$/i.exec(nombre);
  return m ? { nombre: nombre.slice(0, m.index).trim(), nota: m[1]!.trim() } : { nombre, nota: null };
}

const tokens = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);

/**
 * Cruce con las declaraciones juradas por nombre (la API no expone otro identificador común).
 * Criterio conservador: todas las palabras del nombre más corto están en el otro y la coincidencia es única.
 */
function cruzarDeclaraciones(eticaFuncionarios: CsvRow[], declaraciones: CsvRow[]) {
  const porId = new Map(declaraciones.map((d) => [d.official_id!, d]));
  const candidatos = eticaFuncionarios
    .filter((f) => porId.has(f.official_id!))
    .map((f) => ({ f, tokens: new Set(tokens(f.nombre!)) }));
  return (nombre: string): Funcionario["ddjj"] => {
    const t = tokens(nombre);
    const matches = candidatos.filter(({ tokens: c }) => {
      const [chico, grande] = t.length <= c.size ? [t, c] : [[...c], new Set(t)];
      return chico.length >= 2 && chico.every((w) => grande.has(w));
    });
    if (matches.length !== 1) return null;
    const { f } = matches[0]!;
    const d = porId.get(f.official_id!)!;
    return {
      fecha: d.fecha_publicacion || null,
      periodo: d.periodo || null,
      totalBienes: Number(d.total_bienes_propios || d.total_bienes || 0),
      inmuebles: Number(d.n_inmuebles || 0),
      rodados: Number(d.n_rodados || 0),
      cargoDeclarado: f.cargo || null,
      reparticion: f.reparticion || null,
      declaracionesPublicadas: Number(d.declaraciones_publicadas || f.declaraciones_publicadas || 0),
    };
  };
}

export interface Correccion {
  id: string;
  nombre?: string;
  partido?: string | null;
  nota?: string;
  fuente_url?: string;
}

export function buildFuncionarios(
  legisladores: CsvRow[],
  autoridadesOriginales: CsvRow[],
  remuneraciones: CsvRow[],
  eticaFuncionarios: CsvRow[] = [],
  declaraciones: CsvRow[] = [],
  correcciones: Correccion[] = [],
): FuncionariosTema {
  const ddjj = cruzarDeclaraciones(eticaFuncionarios, declaraciones);
  // Correcciones curadas (data/curado/correcciones.yaml): cuando dos fuentes oficiales no coinciden.
  const porId = new Map(correcciones.map((c) => [c.id, c]));
  const autoridades = autoridadesOriginales.map((a) => {
    const c = porId.get(a.id!);
    if (!c) return a;
    return {
      ...a,
      nombre: c.nombre ?? a.nombre!,
      partido: c.partido === null ? "" : (c.partido ?? a.partido!),
      fuente_url: c.fuente_url ?? a.fuente_url!,
      nota_curada: c.nota ?? "",
    };
  });
  const sueldo = (prefijo: string) =>
    remuneraciones
      .filter((r) => r.cargo_o_persona?.startsWith(prefijo) && !/desarraigo|movilidad/i.test(r.concepto ?? ""))
      .map((r) => ({ concepto: r.concepto!, monto: Number(r.monto_bruto), periodo: r.periodo!, fuenteUrl: r.fuente_url! }));

  const personas: Funcionario[] = [
    ...autoridades.map((a): Funcionario => {
      const grupo =
        a.poder === "ejecutivo_provincial"
          ? "ejecutivo"
          : a.poder === "municipal"
            ? "intendentes"
            : /senado/i.test(a.organismo ?? "")
              ? "senado_nacional"
              : "diputados_nacional";
      const separado = separarNota(a.nombre!);
      return {
        id: a.id!,
        nombre: separado.nombre,
        nota: a.nota_curada || separado.nota,
        cargo: a.cargo!,
        grupo,
        organismo: a.organismo!,
        partido: a.partido || null,
        bloque: a.bloque || null,
        seccion: null,
        mandatoDesde: anio(a.mandato_desde!),
        mandatoHasta: anio(a.mandato_hasta!),
        email: null,
        perfilUrl: a.perfil_url || null,
        fuenteUrl: a.fuente_url!,
        remuneracion:
          grupo === "diputados_nacional" ? sueldo("Diputado") : grupo === "senado_nacional" ? sueldo("Senador") : [],
        // Los legisladores nacionales declaran ante la Oficina Anticorrupción, no ante Ética Pública de Mendoza.
        ddjj: grupo === "diputados_nacional" || grupo === "senado_nacional" ? null : ddjj(a.nombre!),
      };
    }),
    ...legisladores.map(
      (l): Funcionario => ({
        id: l.id!,
        ...separarNota(l.nombre!),
        cargo: l.cargo!.replace("diputado/a", "Diputado/a provincial").replace("senador/a", "Senador/a provincial"),
        grupo: l.camara === "senado" ? "senado_provincial" : "diputados_provincial",
        organismo: l.camara === "senado" ? "Cámara de Senadores de Mendoza" : "Cámara de Diputados de Mendoza",
        partido: l.partido || null,
        bloque: l.bloque || null,
        seccion: l.seccion_electoral ? `${l.seccion_electoral} sección electoral` : null,
        mandatoDesde: anio(l.mandato_desde!),
        mandatoHasta: anio(l.mandato_hasta!),
        email: l.email || null,
        perfilUrl: l.perfil_url || null,
        fuenteUrl: l.fuente_url!,
        remuneracion: [],
        ddjj: ddjj(separarNota(l.nombre!).nombre),
      }),
    ),
  ];

  // El Ejecutivo va por jerarquía (gobernador, vice, ministros, resto); los demás grupos, por apellido.
  const rango = (p: Funcionario) =>
    p.grupo !== "ejecutivo" ? 0 : /^gobernador/i.test(p.cargo) ? 1 : /^vicegobernador/i.test(p.cargo) ? 2 : /^ministr/i.test(p.cargo) ? 3 : 4;
  const apellido = (n: string) => n.split(/\s+/).at(-1) ?? n;
  return {
    personas: personas.sort((a, b) => rango(a) - rango(b) || apellido(a.nombre).localeCompare(apellido(b.nombre), "es")),
  };
}
