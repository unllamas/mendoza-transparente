import { describe, expect, test } from "bun:test";
import { reader } from "./rivadavia.ts";

// Text rebuilt by rows (pdfRows), as the reader receives it. Page 62 has the OCR junk of the letterhead above its address.
const text = `── página 60 ──
Artículo 2°: Fijase el valor de la Unidad Tributaria Municipal en un monto de $119,60
── página 61 ──
ANEXO III
CLASIFICACIÓN DE COMERCIOS Y PAGO ANUAL
001 - ABONOS, AGROQUIM. Y/0 FERTILIZANTES
1 - Depósito y/o venta - 1° categoría 12-004-01-00-01 1800 UTM
2° categoría 12-004-01-00-02 1300 UTM
013 - ARTÍCULOS DE ELECTRICIDAD, ARTEFACTOS
DEL HOGAR Y ELECTRODOMÉSTICOS
1 - Venta exclusiva 12-013-01-00-01
1000 UTM
2° categoría 12-013-01-00-02
500 UTM
── página 62 ──
CONCEJO
gifl et " 2 :0 DELIBERANTE B
A. del Valle y lavalle 1 t.„, (263) 4442265 1 (ID rivadaviamendoza.gob.ar/hcd
2° categoría 12-013-02-00-02 500 UTM
017 - AUTOSERVICIOS Y/0 SUPERMERCADOS
1 — Integral 12-016-01-00-00 45510 UTM
1° categoría 12-016-01-00-01 9102 UTM
009 - ANHÍDRIDOS
1 - Carbónicos, sulfurosos, oxígeno y similares (venta y/o
depósito) 12-007-01-00-01 500 UTM
075 - FERRETERÍAS Y SANITARIOS
1 - En locales establecidos 12-063-0 1-00-0 1
1500 UTM
2° categoría 12-063-01-00-02
1200 UTM
129 - QUIOSCO
Venta de cigarrillos, golosinas y bebidas alcohólicas
1 - Locales Municipales 12-100-01-00-01 600 UTM
2° categoría 12-100-01-00-02 500 UTM
136 - ROTISERÍAS Y PIZZERÍAS
En locales establecidos
1 - 1° categoría 12-107-01-00-01 1000 UTM
2 - 2° categoría 12-107-01-00-02 700 UTM
3 - Con Delivery anexo (distribución a Domicilio) 12-107-01-00-03 300 UTM
031 - VENTA DE
31 - Verduras y/o frutas por Mayor 12-117-04-00-01 800 UTM
Por Menor 1° categoría 12-117-05-00-01 400 UTM
Por Menor 2° categoría 12-117-05-00-02 200 UTM
── página 63 ──
ANEXO IV
`;

describe("rivadavia reader", () => {
  const rows = reader.read(text);
  const find = (codigo: string, categoria: string) => rows.find((r) => r.codigo === codigo && r.categoria === categoria);

  test("reads each line as a code, a category and an annual amount in UTM", () => {
    expect(find("12-004-01-00", "01")).toMatchObject({ monto: 1800, unidad: "UTM", pagina: 61 });
    expect(find("12-004-01-00", "02")?.monto).toBe(1300);
    expect(find("12-004-01-00", "02")?.rubro).toBe("ABONOS, AGROQUIM. Y/0 FERTILIZANTES - Depósito y/o venta");
  });

  test("takes the amount from the next line and joins a wrapped group name", () => {
    expect(find("12-013-01-00", "01")).toMatchObject({
      monto: 1000,
      rubro: "ARTÍCULOS DE ELECTRICIDAD, ARTEFACTOS DEL HOGAR Y ELECTRODOMÉSTICOS - Venta exclusiva",
    });
    expect(find("12-013-01-00", "02")?.monto).toBe(500);
  });

  test("skips the letterhead of the page and keeps the item of the line above for a category line", () => {
    expect(find("12-013-02-00", "02")).toMatchObject({ monto: 500, pagina: 62 });
    expect(find("12-013-02-00", "02")?.rubro).toContain("Venta exclusiva");
    expect(rows.some((r) => r.rubro.includes("CONCEJO"))).toBe(false);
  });

  test("joins a name that wraps before its code and keeps the category of the integral row", () => {
    expect(find("12-007-01-00", "01")?.rubro).toBe("ANHÍDRIDOS - Carbónicos, sulfurosos, oxígeno y similares (venta y/o depósito)");
    expect(find("12-016-01-00", "00")?.monto).toBe(45510);
    expect(find("12-016-01-00", "01")?.rubro).toBe("AUTOSERVICIOS Y/0 SUPERMERCADOS - Integral");
  });

  test("fixes the spaces the OCR leaves inside a code", () => {
    expect(find("12-063-01-00", "01")?.monto).toBe(1500);
    expect(find("12-063-01-00", "02")?.monto).toBe(1200);
  });

  test("names an item with its sub-heading when the line is only a category", () => {
    expect(find("12-107-01-00", "01")?.rubro).toBe("ROTISERÍAS Y PIZZERÍAS - En locales establecidos");
    expect(find("12-107-01-00", "03")?.rubro).toBe("ROTISERÍAS Y PIZZERÍAS - Con Delivery anexo (distribución a Domicilio)");
    expect(find("12-100-01-00", "02")?.rubro).toBe("QUIOSCO - Locales Municipales");
  });

  test("drops the trailing category from a name and ignores what comes after Anexo III", () => {
    expect(find("12-117-05-00", "01")?.rubro).toBe("VENTA DE - Por Menor");
    expect(find("12-117-05-00", "02")?.rubro).toBe("VENTA DE - Por Menor");
    expect(rows.some((r) => r.pagina === 63)).toBe(false);
  });
});
