import { describe, expect, test } from "bun:test";
import { reader } from "./capital.ts";

const text = `── página 10 ──
Honorable Concejo Deliberante
de la Ciudad de Mendoza
III. EXPENDIO DE PRODUCTOS ALIMENTICIOS Y OTROS PRODUCTOS AFINES A

── página 11 ──
Honorable Concejo Deliberante
de la Ciudad de Mendoza
LA ACTIVIDAD
3) Venta de sustancias alimenticias Minoristas y de consumo familiar.
1 10 3 03 11 10 400 UTM
1 10 3 03 11 20 250 UTM
1 10 3 03 11 30 150 UTM
IV.
V. LOCALES PARA ELABORACION Y CONSUMO DE ALIMENTOS
6) Cocina (comidas para llevar), Rotiserías
1 10 4 05 11 10 1075 UTM
13) Instituciones
deportivas 1 14 6 13 11 10 1290 UTM
── página 17 ──
II. Artículos de consumo, comercial, personal y vestimenta
1 14 2 01 11 10 807 UTM
1 14 2 01 11 20 484 UTM
── página 18 ──
IV. 1) Venta y distribución de artículos varios, incluye depósito atinente al mismo
1 14 4 01 11 1 3763 UTM
── página 30 ──
1 99 9 99 11 10 5 UTM
`;

describe("capital reader", () => {
  const rows = reader.read(text);
  const find = (codigo: string, categoria: string) => rows.find((r) => r.codigo === codigo && r.categoria === categoria);

  test("reads the grocery amounts by category, in UTM", () => {
    expect(rows.filter((r) => r.codigo === "11030311").map((r) => [r.categoria, r.monto])).toEqual([
      ["10", 400],
      ["20", 250],
      ["30", 150],
    ]);
    const first = find("11030311", "10")!;
    expect(first.rubro).toBe("Venta de sustancias alimenticias Minoristas y de consumo familiar.");
    expect(first.unidad).toBe("UTM");
    expect(first.pagina).toBe(11);
  });

  test("skips empty headings and takes the name from the line above", () => {
    expect(find("11040511", "10")).toMatchObject({ rubro: "Cocina (comidas para llevar), Rotiserías", monto: 1075 });
  });

  test("joins a name glued to the code line and reads clothing", () => {
    expect(find("11461311", "10")?.rubro).toBe("Instituciones deportivas");
    expect(find("11420111", "20")).toMatchObject({ rubro: "Artículos de consumo, comercial, personal y vestimenta", monto: 484 });
  });

  test("keeps a broken category as printed and ignores pages outside the chapter", () => {
    expect(find("11440111", "1")?.monto).toBe(3763);
    expect(rows.some((r) => r.codigo.startsWith("19"))).toBe(false);
  });
});
