import { describe, expect, test } from "bun:test";

import { parseAmount, parseMatrix } from "./atm-recaudacion.ts";

describe("atm-recaudacion", () => {
  test("montos con coma de miles y decimales con punto", () => {
    expect(parseAmount("117,078,451,628")).toBe(117078451628);
    expect(parseAmount("7,882,943,560.5")).toBe(7882943560.5);
    expect(parseAmount("")).toBeNull();
  });

  test("tabla meses x años: ignora meses vacíos, filas incompletas y totales", () => {
    const html = `<table><tr><td>Ingresos Brutos</td></tr>
      <tr><td class="active">Meses</td><td>2025</td><td>2026</td></tr>
      <tr><td class="active">Enero</td><td>1,000</td><td>2,000</td></tr>
      <tr><td class="active">Febrero</td><td>3,000</td></tr>
      <tr><td class="active">Marzo</td><td>4,000</td><td></td></tr>
      <td class="active">Totales </td><td>8,000</td><td>2,000</td></table>`;
    expect(parseMatrix(html)).toEqual([
      { anio: 2025, mes: 1, monto: 1000 },
      { anio: 2026, mes: 1, monto: 2000 },
      { anio: 2025, mes: 2, monto: 3000 },
      { anio: 2025, mes: 3, monto: 4000 },
    ]);
  });
});
