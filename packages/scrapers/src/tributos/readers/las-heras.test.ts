import { describe, expect, test } from "bun:test";
import { reader } from "./las-heras.ts";

/** Wraps lines in the header of article 27 and its sections A, B and C, so the reader is inside a table. */
const article = (body: string) =>
  `ARTÍCULO 27º: DERECHO ANUAL\nA. ACADEMIAS DE:\nB. ASISTENCIA MÉDICA PRIVADA\nC. COMERCIOS VARIOS\n${body}`;

describe("las-heras reader", () => {
  test("reads a row with its three categories, CIIU code, UT unit and page", () => {
    const rows = reader.read(article("── página 34 ──\n- Almacén minorista. 1450 900 420 G521101"));
    expect(rows.map((r) => [r.categoria, r.monto])).toEqual([
      ["A", 1450],
      ["B", 900],
      ["C", 420],
    ]);
    expect(rows[0]).toMatchObject({ rubro: "Almacén minorista", codigo: "G521101", unidad: "UT", pagina: 34 });
  });

  test("a category with 0 gives no row", () => {
    const rows = reader.read(article("-Hogar geriátrico 7000 0 0 N853101"));
    expect(rows.map((r) => [r.categoria, r.monto])).toEqual([["A", 7000]]);
  });

  test("a parent heading is prefixed to the a) and b) items; single-amount rows are left out", () => {
    const rows = reader.read(
      article(
        [
          "- Carnes, embutidos y chacinados:",
          "(Trozadero).",
          "a) Mayorista. 2400 1250 750 G512207",
          "b) Minorista 1500 1000 450 G522007",
          "- Delivery 1000",
        ].join("\n"),
      ),
    );
    const minorista = rows.filter((r) => r.rubro === "Carnes, embutidos y chacinados: Minorista");
    expect(minorista.map((r) => r.monto)).toEqual([1500, 1000, 450]);
    expect(rows.some((r) => r.rubro.includes("Delivery"))).toBe(false);
  });

  test("a name split over two lines is joined", () => {
    const rows = reader.read(article("-Mercadito con venta de art. de\nAlmacén. 1500 1000 750 G522002"));
    expect(rows[0]).toMatchObject({ rubro: "Mercadito con venta de art. de Almacén", codigo: "G522002" });
  });
});
