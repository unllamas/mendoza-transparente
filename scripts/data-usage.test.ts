import { describe, expect, test } from "bun:test";
import { mentions } from "./data-usage";

describe("mentions", () => {
  test("vale el par explícito de fuente y archivo", () => {
    expect(mentions(`readTable("lrf-personal", "personal.csv")`, "lrf-personal", ["personal.csv"])).toBe(true);
    expect(mentions("data/processed/lrf-personal/personal.csv", "lrf-personal", ["personal.csv"])).toBe(true);
  });

  test("un par con otra fuente no cuenta como uso del mismo nombre", () => {
    const code = `readTable("autoridades", "remuneraciones.csv"); readTable("legislatura", "legisladores.csv");`;
    expect(mentions(code, "legislatura", ["remuneraciones.csv"])).toBe(false);
    expect(mentions(code, "autoridades", ["remuneraciones.csv"])).toBe(true);
  });

  test("sin pares, alcanza con nombrar la fuente y el archivo (lectura desde una lista)", () => {
    const code = `const ids = ["resultados-provisorios"]; read(id, "mesas.csv.gz");`;
    expect(mentions(code, "resultados-provisorios", ["mesas.csv.gz", "mesas.csv"])).toBe(true);
    expect(mentions(code, "escrutinios-definitivos", ["mesas.csv.gz", "mesas.csv"])).toBe(false);
  });
});
