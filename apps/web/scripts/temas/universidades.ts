/**
 * Universidades nacionales en Mendoza: transferencias de Nación (data/processed/universidades-presupuesto) y el
 * Anuario de Estadísticas Universitarias (data/processed/universidades-estadisticas). La ficha mira la UNCuyo; la
 * UTN reporta una sola cifra para todo el país y solo se muestra como total nacional.
 */

import type { UniversidadesTema } from "../../src/types.ts";
import { deflactor } from "./inflacion.ts";

type CsvRow = Record<string, string>;

/** Longest history shown: more years dilute what is happening now. */
const YEARS_SHOWN = 8;

/** Short names for what the transfers pay for (the "actividad" of the national budget). */
const DESTINATIONS: [RegExp, string][] = [
  [/salario docente/i, "Sueldos de docentes y autoridades"],
  [/no docente/i, "Sueldos del personal no docente"],
  [/funcionamiento/i, "Funcionamiento"],
  [/hospitales/i, "Hospitales universitarios"],
  [/ciencia y la tecnica/i, "Ciencia y técnica"],
];
const OTHER = "Otros programas";

const lastYears = <T extends { anio: number }>(rows: T[]) => {
  const sorted = [...rows].sort((a, b) => a.anio - b.anio);
  const last = sorted.at(-1)?.anio ?? 0;
  return sorted.filter((r) => r.anio > last - YEARS_SHOWN);
};

export function buildUniversidades(
  transfers: CsvRow[],
  students: CsvRow[],
  staff: CsvRow[],
  disciplines: CsvRow[],
  performance: CsvRow[],
  ipc: CsvRow[],
): UniversidadesTema | undefined {
  const defl = deflactor(ipc);
  if (!defl) return undefined;

  // The year of the cut-off date is still running: it goes apart, with its budget and what was spent so far.
  const corte = transfers.reduce((max, r) => ((r.fecha_corte ?? "") > max ? r.fecha_corte! : max), "");
  const current = Number(corte.slice(0, 4));
  const sumOf = (id: string, anio: number, field: string) =>
    transfers
      .filter((r) => r.universidad_id === id && Number(r.anio) === anio)
      .reduce((s, r) => s + defl.aReal(Number(r[field] || 0), anio), 0);

  const fullYears = [...new Set(transfers.map((r) => Number(r.anio)))].filter((y) => y < current);
  const transferencias = lastYears(
    fullYears.map((anio) => ({
      anio,
      real: sumOf("uncuyo", anio, "devengado"),
      nominal: transfers
        .filter((r) => r.universidad_id === "uncuyo" && Number(r.anio) === anio)
        .reduce((s, r) => s + Number(r.devengado || 0), 0),
    })),
  );

  const destinations = new Map<string, number>();
  for (const r of transfers.filter((r) => r.universidad_id === "uncuyo" && Number(r.anio) === current)) {
    const nombre = DESTINATIONS.find(([re]) => re.test(r.actividad!))?.[1] ?? OTHER;
    destinations.set(nombre, (destinations.get(nombre) ?? 0) + defl.aReal(Number(r.devengado || 0), current));
  }
  const destino = [...destinations]
    .map(([nombre, real]) => ({ nombre, real }))
    .filter((d) => d.real > 0)
    .sort((a, b) => (a.nombre === OTHER ? 1 : b.nombre === OTHER ? -1 : b.real - a.real));

  const uncuyoStudents = students.filter((r) => r.universidad_id === "uncuyo");
  const estudiantes = lastYears(
    uncuyoStudents
      .filter((r) => r.nivel === "pregrado_grado")
      .map((r) => {
        const posgrado = uncuyoStudents.find((p) => p.nivel === "posgrado" && p.anio === r.anio);
        return {
          anio: Number(r.anio),
          estudiantes: Number(r.estudiantes),
          nuevos: Number(r.nuevos_inscriptos),
          egresados: Number(r.egresados),
          posgrado: posgrado ? Number(posgrado.estudiantes) : null,
        };
      }),
  );

  // Transfers per student (undergraduate and graduate). The Anuario's own spending per student has gaps and a
  // 2018 figure that does not match its other tables, so it is not used.
  const porEstudiante = estudiantes
    .map((e) => {
      const real = sumOf("uncuyo", e.anio, "devengado");
      return real ? { anio: e.anio, real: real / (e.estudiantes + (e.posgrado ?? 0)) } : null;
    })
    .filter((e) => e !== null);

  const uncuyoStaff = staff.filter((r) => r.universidad_id === "uncuyo");
  const staffYear = Math.max(...uncuyoStaff.map((r) => Number(r.anio)));
  const row = (tipo: string, key: "dedicacion" | "categoria", value: string) =>
    uncuyoStaff.find((r) => Number(r.anio) === staffYear && r.tipo === tipo && r[key] === value);
  const count = (r: CsvRow | undefined) => ({ cargos: Number(r?.cargos || 0), personas: Number(r?.personas || 0) });
  const dedication = (id: string, nombre: string) => ({ id, nombre, cargos: Number(row("docente", "dedicacion", id)?.cargos || 0) });
  const personal = uncuyoStaff.length
    ? {
        anio: staffYear,
        docentes: count(row("docente", "dedicacion", "total")),
        dedicacion: [dedication("exclusiva", "Exclusiva"), dedication("semiexclusiva", "Semiexclusiva"), dedication("simple", "Simple")],
        noDocentes: count(row("no_docente", "categoria", "total")),
        preuniversitario: count(row("preuniversitario", "dedicacion", "total")),
        autoridades: Number(row("autoridades_superiores", "dedicacion", "total")?.personas || 0),
      }
    : null;

  const uncuyoDisciplines = disciplines.filter((r) => r.universidad_id === "uncuyo" && r.disciplina !== "total" && r.rama !== "Sin rama");
  const disciplineYear = Math.max(...uncuyoDisciplines.map((r) => Number(r.anio)));
  const disciplinas = uncuyoDisciplines.length
    ? {
        anio: disciplineYear,
        items: uncuyoDisciplines
          .filter((r) => Number(r.anio) === disciplineYear)
          .map((r) => ({
            disciplina: r.disciplina!,
            rama: r.rama!,
            estudiantes: Number(r.estudiantes || 0),
            nuevos: Number(r.nuevos_inscriptos || 0),
            egresados: Number(r.egresados || 0),
          }))
          .sort((a, b) => b.estudiantes - a.estudiantes),
      }
    : null;

  const uncuyoPerformance = performance.filter((r) => r.universidad_id === "uncuyo");
  const performanceYear = Math.max(...uncuyoPerformance.map((r) => Number(r.anio)));
  const share = (population: string, subjects: string[]) =>
    uncuyoPerformance
      .filter((r) => Number(r.anio) === performanceYear && r.poblacion === population && subjects.includes(r.materias_aprobadas!))
      .reduce((s, r) => s + Number(r.porcentaje || 0), 0);
  const rendimiento = uncuyoPerformance.length
    ? {
        anio: performanceYear,
        nuevosSinMaterias: share("nuevos_inscriptos", ["0"]),
        reinscriptosSinMaterias: share("reinscriptos", ["0"]),
        reinscriptosDosOMas: share("reinscriptos", ["2", "3", "4", "5", "6_o_mas"]),
      }
    : null;

  const utnStudents = students
    .filter((r) => r.universidad_id === "utn" && r.nivel === "pregrado_grado")
    .sort((a, b) => Number(a.anio) - Number(b.anio))
    .at(-1);
  const utnBudget = sumOf("utn", current, "credito_vigente");
  const utn = utnStudents
    ? { anioEstudiantes: Number(utnStudents.anio), estudiantes: Number(utnStudents.estudiantes), anio: current, presupuestado: utnBudget }
    : null;

  const previous = transferencias.at(-1)!;
  return {
    referencia: defl.referencia,
    enCurso: {
      anio: current,
      corte,
      presupuestado: sumOf("uncuyo", current, "credito_vigente"),
      devengado: sumOf("uncuyo", current, "devengado"),
      anterior: { anio: previous.anio, real: previous.real },
      destino,
    },
    transferencias,
    estudiantes,
    porEstudiante,
    personal,
    disciplinas,
    rendimiento,
    utn,
  };
}
