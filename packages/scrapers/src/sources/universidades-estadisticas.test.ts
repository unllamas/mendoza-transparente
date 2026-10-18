import { describe, expect, test } from "bun:test";

import {
  institutionRows,
  parseAnuarioLinks,
  parseDocentes,
  parseGastoPorEstudiante,
  parseSeries,
  pickBest,
  tableOf,
} from "./universidades-estadisticas.ts";

describe("universidades-estadisticas", () => {
  test("serie con años numéricos o de texto y las dos universidades", () => {
    const grid = [
      ["Cuadro 2.1.1 - Estudiantes de títulos de pregrado y grado y tasa de crecimiento. Período 2011 - 2013"],
      [null, "Institución", "Año"],
      [null, null, "2011", "2012", "2013"],
      [null, "Nuevo Cuyo", 1, 2, 3],
      [null, "Cuyo", 31397, 31755, "-"],
      [null, "Tecnológica Nacional", 82416, 83090, 80052],
    ];
    const s = parseSeries(grid);
    expect([...(s.uncuyo ?? [])]).toEqual([
      [2011, 31397],
      [2012, 31755],
    ]);
    expect(s.utn?.get(2013)).toBe(80052);
    expect(institutionRows(grid).uncuyo?.[1]).toBe("Cuyo");
  });

  test("título del cuadro con y sin prefijo", () => {
    expect(tableOf("a", [["Cuadro 4.3. - Edad promedio. Año 2024"]])).toMatchObject({ num: "4.3", year: 2024 });
    expect(tableOf("a", [["2.1.1 - Estudiantes de títulos"]])?.title).toBe("estudiantes de titulos");
    expect(tableOf("a", [["Gráfico 2.1.1 - Evolución"]])).toBeNull();
  });

  test("cargos docentes por dedicación se leen del subencabezado", () => {
    const grid = [
      ["Institución", null, "Total Cargos Docentes Universitarios", null, "Exclusiva"],
      [null, null, null, null, "Total", "Titular", null, "Total", "Titular", null, "Total", "Titular", null, "Total"],
      ["Cuyo", null, 6670, null, 694, 317, null, 2129, 461, null, 3847, 518, null, "-"],
    ];
    expect(parseDocentes(grid).uncuyo).toEqual({ total: 6670, exclusiva: 694, semiexclusiva: 2129, simple: 3847, otro: 0 });
  });

  test("gasto por estudiante: las columnas salen del texto del encabezado", () => {
    const grid = [
      ["Institución", "Gasto Total del Año 2024", null, null, "Cantidad de estudiantes (1)", "Gasto por Estudiante"],
      [null, "Total", "Corrientes", "De Capital", null, "Total", "Corrientes", "De Capital"],
      ["Cuyo", 121714722158.57, 120255021295.1, 1459700863.47, 34098, 3569556.05, 3526747.06, 42808.99],
    ];
    expect(parseGastoPorEstudiante(grid).uncuyo).toMatchObject({
      gasto_total: 121714722158.57,
      estudiantes: 34098,
      gasto_por_estudiante: 3569556.05,
    });
  });

  test("links de la página: sin CSV, el definitivo gana al adelanto", () => {
    const html = `<a href="/sites/default/files/2020/04/adelanto_anuario_24_14-08.zip">Adelanto Anuario 2024</a>
      <a href="/x/anuario_2021.zip">Anuario 2021</a><a href="/x/anuario_csv_2021.zip">Anuario 2021</a>
      <a href="/x/definitivo.zip">Anuario 2024</a>`;
    const links = parseAnuarioLinks(html, "https://www.argentina.gob.ar/educacion/anuarios");
    expect(links.map((l) => [l.year, l.adelanto, l.filename])).toEqual([
      [2024, false, "anuario_2024.zip"],
      [2021, false, "anuario_2021.zip"],
    ]);
    expect(links[0]?.url).toBe("https://www.argentina.gob.ar/x/definitivo.zip");
  });

  test("el anuario más nuevo y el detalle del año ganan, y se cuentan las correcciones", () => {
    const row = (monto: number) => ({ monto });
    const { rows, revisions } = pickBest([
      { key: "a", rank: 2020, row: row(1) },
      { key: "a", rank: 2024, row: row(2) },
      { key: "b", rank: 1000 + 2020, row: row(5) }, // year detail from an older yearbook beats a newer series
      { key: "b", rank: 2024, row: row(9) },
    ]);
    expect(rows.map((r) => r.monto).sort()).toEqual([2, 5]);
    expect(revisions).toBe(2);
  });
});
