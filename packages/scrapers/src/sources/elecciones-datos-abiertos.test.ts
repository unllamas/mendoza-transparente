import { describe, expect, test } from "bun:test";

import { classifyVoteType, parseDepartment, parsePartyLabel } from "./elecciones-datos-abiertos.ts";

describe("elecciones-datos-abiertos", () => {
  test("etiquetas de tipo de voto de todas las planillas", () => {
    expect(classifyVoteType("VOTOS EN BLANCO")).toBe("blanco");
    expect(classifyVoteType("Votos blancos")).toBe("blanco");
    expect(classifyVoteType("VOTOS DE IDENTIDAD IMPUGNADA")).toBe("impugnado");
    expect(classifyVoteType("POSITIVOS")).toBe("positivo");
    expect(classifyVoteType("VOTOS DE COMANDO ELECTORAL")).toBe("comando_electoral");
    expect(classifyVoteType("Lista 300 - Frente")).toBeNull();
  });

  test("lista con candidato entre paréntesis", () => {
    expect(parsePartyLabel("Lista 300 - Frente Cambia Mendoza (SUÁREZ, Rodolfo)")).toEqual({
      num: "300",
      name: "Frente Cambia Mendoza",
      candidate: "SUÁREZ, Rodolfo",
    });
    expect(parsePartyLabel("222 - Protectora Fuerza Política")?.candidate).toBe("");
    expect(parsePartyLabel("Agrupación política")).toBeNull();
  });

  test("departamentos en los tres formatos y error si no se reconoce", () => {
    expect(parseDepartment("02-Godoy Cruz")).toBe("Godoy Cruz");
    expect(parseDepartment("Departamento 14-Santa Rosa")).toBe("Santa Rosa");
    expect(parseDepartment("Departamento: 12 - TUNUYAN")).toBe("Tunuyán");
    expect(parseDepartment("Circuito:1 - CIUDAD DE MENDOZA")).toBeNull();
    expect(() => parseDepartment("99-Atlantis")).toThrow();
  });
});
