import { describe, expect, test } from "bun:test";
import { agencySummary, officialSummary, supplierSummary } from "./summaries.ts";

const official = {
  nombre: "Ana Pérez",
  grupo: "diputados_provincial",
  organismo: "Cámara de Diputados de Mendoza",
  cargo: "Diputado/a provincial",
  partido: null,
  bloque: "Bloque Uno",
  mandatoHasta: "2027",
  ddjj: null,
  remuneracion: [],
} as unknown as Parameters<typeof officialSummary>[0];

describe("officialSummary", () => {
  test("los cargos con barra se dicen por la cámara, sin escribir el género con barra", () => {
    expect(officialSummary(official)).toBe(
      "Ana Pérez integra la Cámara de Diputados de Mendoza (Bloque Uno), con mandato hasta 2027. Su sueldo no está publicado.",
    );
  });

  test("el Senado de la Nación lleva «el»", () => {
    const s = officialSummary({ ...official, grupo: "senado_nacional", organismo: "Senado de la Nación", cargo: "Senador/a nacional" });
    expect(s).toStartWith("Ana Pérez integra el Senado de la Nación");
  });

  test("los cargos del Ejecutivo suman «de Mendoza» y solo nombran lo que se declaró", () => {
    const s = officialSummary({
      ...official,
      grupo: "ejecutivo",
      organismo: "Ministerio de Producción",
      cargo: "Ministro de Producción",
      bloque: null,
      mandatoHasta: null,
      ddjj: { totalBienes: 41_700_000, inmuebles: 0, rodados: 1 } as never,
      remuneracion: [{ concepto: "Sueldo", monto: 6_100_000, periodo: "oct 2026", fuenteUrl: "" }],
    });
    expect(s).toBe(
      "Ana Pérez es ministro de Producción de Mendoza. Declaró inmuebles y vehículos a su nombre por $ 41,7 millones a valor fiscal (1 vehículo). Cobra $ 6,1 millones brutos por mes.",
    );
  });

  test("los cargos de la cámara nombran cuál", () => {
    const s = officialSummary({
      ...official,
      grupo: "senado_provincial",
      organismo: "Cámara de Senadores de Mendoza",
      cargo: "presidente provisional de la cámara",
    });
    expect(s).toStartWith("Ana Pérez es presidente provisional de la Cámara de Senadores de Mendoza (Bloque Uno)");
  });
});

describe("supplierSummary", () => {
  test("monto, procesos, años, quién es y quién le compra más", () => {
    expect(
      supplierSummary({
        name: "ACME S.A.",
        total: 544_300_000,
        processes: 8,
        first: "2022-08-09",
        last: "2025-04-11",
        companyType: "S.A.",
        place: "San Rafael, Mendoza",
        activity: "Construcción",
        mainBuyer: { name: "Vialidad", pct: 64.6 },
      }),
    ).toBe(
      "ACME S.A. ganó $ 544,3 millones en contrataciones con el Estado de Mendoza en 8 procesos entre 2022 y 2025. Es una S.A. de San Rafael, Mendoza (construcción). Su principal comprador es Vialidad (65 % del total).",
    );
  });

  test("un solo año y sin datos de la empresa", () => {
    expect(
      supplierSummary({
        name: "X",
        total: 1_000,
        processes: 1,
        first: "2024-01-01",
        last: "2024-05-01",
        companyType: null,
        place: null,
        activity: null,
      }),
    ).toBe("X ganó $ 1.000 en contrataciones con el Estado de Mendoza en 1 proceso en 2024.");
  });
});

describe("agencySummary", () => {
  test("sin proveedor principal no lo nombra", () => {
    expect(
      agencySummary({ name: "Hospital", total: 37.5e9, processes: 5705, pctDirect: 84.2, pctOneOffer: 20.6, mainSupplier: null }),
    ).toBe(
      "Hospital adjudicó $ 37,5 mil millones en 5.705 procesos de compra. El 84 % fueron contrataciones directas y el 21 % recibió una sola oferta.",
    );
  });
});
