import { expect, test } from "bun:test";
import { reader } from "./guaymallen.ts";

const SAMPLE = `── página 1 ──
Texto del articulado 100 200 300 400
ANEXO B - NOMENCLADOR DE ACTIVIDADES ECONOMICAS
TARIFARIA 2026
── página 61 ──
INDUSTRIAS
101015 Frigorífico - Producción y procesamiento de carnes.
Servicios de frío y
refrigerado
2030 1690 1350 1000
ORDENANZA REGISTRADA BAJO EL N.°10298
139900
Fabricación de artículos y productos textiles: delantales
880 460 310 150
── página 66 ──
COMERCIOS MINORISTAS
472120 Despensa - Almacén - Mercadito 580 400 320 170
472120 Especias y condimentos 260 170 100 50
477470 Venta de mascotas - Prohibido por Ordenanza 8438-17 0
471191 Quiosco - Maxi Quiosco - Minimarket - Drugstore 1060 730 580 480
── página 73 ──
524120 Playa de siniestros viales 0
ANEXO C
999999 Fuera del anexo 1 2 3 4
`;

const rows = reader.read(SAMPLE);
const amounts = (code: string, name: string) => rows.filter((r) => r.codigo === code && r.rubro.startsWith(name)).map((r) => r.monto);

test("reads four categories in UTM for a single-line activity", () => {
  expect(amounts("472120", "Despensa")).toEqual([580, 400, 320, 170]);
  expect(amounts("471191", "Quiosco")).toEqual([1060, 730, 580, 480]);
  const row = rows.find((r) => r.codigo === "471191");
  expect(row?.unidad).toBe("UTM");
  expect(row?.grupo).toBe("COMERCIOS MINORISTAS");
  expect(row?.pagina).toBe(66);
});

test("joins names wrapped over several lines and a code alone on its line", () => {
  expect(rows.find((r) => r.codigo === "101015")?.rubro).toBe(
    "Frigorífico - Producción y procesamiento de carnes. Servicios de frío y refrigerado",
  );
  expect(amounts("101015", "Frigo")).toEqual([2030, 1690, 1350, 1000]);
  expect(amounts("139900", "Fabricación")).toEqual([880, 460, 310, 150]);
});

test("keeps both activities that share a code, and skips fee-less ones and what is outside the annex", () => {
  expect(rows.filter((r) => r.codigo === "472120" && r.categoria === "1").length).toBe(2);
  expect(amounts("472120", "Especias")).toEqual([260, 170, 100, 50]);
  expect(rows.some((r) => r.codigo === "477470" || r.codigo === "524120" || r.codigo === "999999")).toBe(false);
  expect(new Set(rows.map((r) => r.categoria))).toEqual(new Set(["1", "2", "3", "4"]));
});
