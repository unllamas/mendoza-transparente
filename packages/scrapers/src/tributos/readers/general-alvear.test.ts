import { describe, expect, test } from "bun:test";
import { reader } from "./general-alvear.ts";

const text = `── página 4 ──
ART. 4) Transferencias clandestinas:
8 - 1 - 1 - 0 - 1 .................... . 1,00
── página 5 ──
ART. 5) COD.8) INSPECCION, INSCRIPCION, HIGIENE Y CONTROL DE COMERCIOS,
5
Categoria X
I - ALMACENES, DESPENSAS, VENTAS DE COMESTIBLES Y BEBIDAS EN GENERAL:
3) Almacenes de ramos generales minoristas: o con características similares.-
8 - 1 - 3 - 0 - 1 .................... . 350838,08
8 - 1 - 3 - 0 - 2 .................... . 175416,05
Cuando además del rubro principal aforado, se anexen otros artículos en pequeñas cantidades
8) derogado
8 - 1 - 8 - 0 - 1 .................... .
13) Despensas:
8 - 1 - 13 - 0 - 1 ...................... . 269859,03
Con anexo de despachos de bebidas:
Tendrán un recargo de 8 - 1 - 13 - 0 - 6. . 52903,42
── página 6 ──
9) Despachos de bebidas - CIUDAD
8 - 1 - 9 - 1 - 1 .................... . 415870,52
En distritos
8 - 1 - 9 - 2 - 1 .................... . 337341,67
II - HOTELES, HOSPEDAJES, RESTAURANTES,VARIOS Y AFINES
13) Alquiler de cabañas
8 – 2 – 13 – 0 – 1 401228,92
8 – 2 – 13 – 0 – 2 …………….. 200101,12
8 - 2 - 12 - 0 - 1
── página 7 ──
ART. 6) COD.9) PUESTOS FIJOS:
8 - 9 - 9 - 9 - 9 ...... 999,00
`;

describe("general alvear reader", () => {
  const rows = reader.read(text);
  const find = (codigo: string, categoria: string) => rows.find((r) => r.codigo === codigo && r.categoria === categoria);

  test("reads the grocery amounts by category, in UTM, with the decimal comma", () => {
    expect(rows.filter((r) => r.codigo === "8-1-3-0").map((r) => [r.categoria, r.monto])).toEqual([
      ["1", 350838.08],
      ["2", 175416.05],
    ]);
    const first = find("8-1-3-0", "1")!;
    expect(first.rubro).toBe("Almacenes de ramos generales minoristas: o con características similares.-");
    expect(first.unidad).toBe("UTM");
    expect(first.pagina).toBe(5);
    expect(first.grupo).toBe("ALMACENES, DESPENSAS, VENTAS DE COMESTIBLES Y BEBIDAS EN GENERAL");
  });

  test("skips rows with no amount and stops outside article 5", () => {
    expect(rows.some((r) => r.codigo === "8-1-8-0")).toBe(false);
    expect(rows.some((r) => r.codigo === "8-2-12-0")).toBe(false);
    expect(rows.some((r) => r.codigo === "8-9-9-9")).toBe(false);
    expect(rows.some((r) => r.monto === 1)).toBe(false);
  });

  test("keeps a surcharge row under its item and its lead-in as part of the name", () => {
    const surcharge = find("8-1-13-0", "6")!;
    expect(surcharge.monto).toBe(52903.42);
    expect(surcharge.rubro).toBe("Despensas - Con anexo de despachos de bebidas - Tendrán un recargo de");
    expect(find("8-1-13-0", "1")!.rubro).toBe("Despensas");
  });

  test("a sub-heading goes into the name, and en dashes and ellipsis are accepted", () => {
    expect(find("8-1-9-2", "1")!.rubro).toBe("Despachos de bebidas - CIUDAD - En distritos");
    expect(find("8-2-13-0", "1")!.monto).toBe(401228.92);
    expect(find("8-2-13-0", "2")!.monto).toBe(200101.12);
  });
});
