/** Quiénes representan a Mendoza: Ejecutivo, Legislatura, intendentes y Congreso nacional. */

import type { FuncionariosTema, Funcionario } from "../../src/types.ts";

type CsvRow = Record<string, string>;

const anio = (s: string) => (s ? s.slice(0, 4) : null);

export function buildFuncionarios(legisladores: CsvRow[], autoridades: CsvRow[], remuneraciones: CsvRow[]): FuncionariosTema {
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
      return {
        id: a.id!,
        nombre: a.nombre!,
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
      };
    }),
    ...legisladores.map(
      (l): Funcionario => ({
        id: l.id!,
        nombre: l.nombre!,
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
      }),
    ),
  ];

  return { personas: personas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")) };
}
