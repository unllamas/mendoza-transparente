import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

import type { Funcionario } from "../../src/types.ts";
import { assignParties, buildPartyRegistry, type PartyEntry, type PartyMention, partyInitials } from "./parties.ts";

const entries = parse(
  readFileSync(join(import.meta.dir, "..", "..", "..", "..", "data", "curado", "partidos.yaml"), "utf8"),
) as PartyEntry[];
const mention = (name: string, use: PartyMention["use"] = "partido"): PartyMention => ({ name, use });
const NAMES = [
  "Cambia Mendoza",
  "Alianza Cambia Mendoza",
  "Frente Cambia Mendoza",
  "Unión Cívica Radical",
  "UCR - Unión Cívica Radical",
  "UCR-Cambia Mendoza",
  "Partido Justicialista",
  "Justicialista",
  "Fuerza Patria",
  "Unión por la Patria",
  "La Libertad Avanza",
  "Mendocinos por la Libertad",
  "PRO",
  "PRO Propuesta Republicana",
  "Unión PRO",
  "Frente de Todos",
  "Frente De Todos",
  "Partido Demócrata",
  "Partido Democrata",
  "Elegí Mendoza",
  "Frente Elegí",
  "Elegí Santa Rosa",
  "Elegí Gestión Lavalle",
  "Cambia Mendoza - Nuevos Rumbos",
  "Nuevos Rumbos",
  "Alianza Frente para la Victoria",
  "Alianza Frente para la Victoria 2",
  "Frente para la Victoria 2",
];
const registry = buildPartyRegistry(
  entries,
  NAMES.map((n) => mention(n)),
);
const slugOf = (name: string) => registry.ref(name)?.slug;

describe("partidos: se unen formas de escribir el mismo nombre", () => {
  test("prefijos legales, siglas y artículos curados", () => {
    expect(slugOf("Alianza Cambia Mendoza")).toBe("cambia-mendoza");
    expect(slugOf("Frente Cambia Mendoza")).toBe("cambia-mendoza");
    expect(slugOf("UCR - Unión Cívica Radical")).toBe("ucr");
    expect(slugOf("Justicialista")).toBe("partido-justicialista");
    expect(slugOf("PRO Propuesta Republicana")).toBe("pro");
    expect(slugOf("Alianza Frente para la Victoria 2")).toBe(slugOf("Frente para la Victoria 2"));
  });

  test("mayúsculas, tildes y signos se ignoran solos", () => {
    expect(slugOf("Frente De Todos")).toBe(slugOf("Frente de Todos"));
    expect(slugOf("Partido Democrata")).toBe(slugOf("Partido Demócrata"));
    expect(registry.ref("Frente De Todos")?.name).toBe("Frente de Todos");
  });
});

describe("partidos: nunca se juntan partidos distintos", () => {
  const apart = [
    ["La Libertad Avanza", "PRO"],
    ["La Libertad Avanza", "Mendocinos por la Libertad"],
    ["PRO", "Unión PRO"],
    ["Partido Justicialista", "Fuerza Patria"],
    ["Partido Justicialista", "Unión por la Patria"],
    ["Cambia Mendoza", "Unión Cívica Radical"],
    ["Cambia Mendoza", "Cambia Mendoza - Nuevos Rumbos"],
    ["Elegí Mendoza", "Frente Elegí"],
    ["Elegí Mendoza", "Elegí Santa Rosa"],
    ["Elegí Santa Rosa", "Elegí Gestión Lavalle"],
    ["Alianza Frente para la Victoria", "Frente para la Victoria 2"],
  ] as const;
  for (const [a, b] of apart) test(`${a} ≠ ${b}`, () => expect(slugOf(a)).not.toBe(slugOf(b)));

  test("un nombre que nadie curó queda como entidad propia, con su nombre", () => {
    expect(registry.ref("Mendocinos por la Libertad")).toMatchObject({
      slug: "mendocinos-por-la-libertad",
      name: "Mendocinos por la Libertad",
    });
  });

  test("cada slug es único", () => {
    const slugs = registry.entities().map((e) => e.ref.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  test("un alias repetido en dos entradas corta el build", () => {
    const dup: PartyEntry[] = [
      { slug: "a", nombre: "A", alias: [{ nombre: "X", motivo: "" }] },
      { slug: "b", nombre: "B", alias: [{ nombre: "x", motivo: "" }] },
    ];
    expect(() => buildPartyRegistry(dup, [])).toThrow();
  });
});

describe("partidos: a nadie se le asigna un partido que la fuente no da", () => {
  const person = (o: Partial<Funcionario>) =>
    ({ grupo: "ejecutivo", cargo: "", partido: null, bloque: null, party: null, partyMissing: false, ...o }) as Funcionario;

  test("un cargo designado no lleva partido, aunque el gobierno tenga uno", () => {
    const minister = person({ cargo: "Ministro de Hacienda y Finanzas" });
    assignParties([minister], registry);
    expect(minister.party).toBeNull();
    expect(minister.partyMissing).toBe(false);
  });

  test("un cargo electo sin partido en la fuente queda marcado, no inferido", () => {
    const vice = person({ cargo: "Vicegobernadora" });
    assignParties([vice], registry);
    expect(vice.party).toBeNull();
    expect(vice.partyMissing).toBe(true);
  });

  test("a un legislador se le muestra su bloque", () => {
    const senator = person({ grupo: "senado_provincial", cargo: "Senador/a provincial", bloque: "UCR-Cambia Mendoza" });
    assignParties([senator], registry);
    expect(senator.party?.slug).toBe("ucr");
  });
});

test("iniciales del partido", () => {
  expect(partyInitials("Cambia Mendoza")).toBe("CM");
  expect(partyInitials("Partido Verde")).toBe("PV");
  expect(partyInitials("Frente Elegí Gestión La Paz")).toBe("EG");
  expect(partyInitials("Frente para la Victoria 2")).toBe("FV");
});

describe("partidos: color de la insignia", () => {
  const official = [
    { nombres: ["Partido Verde"], color: "#7E984D" },
    { nombres: ["Elegí Mendoza"], anios: [2019], color: "#0a82d4" },
    { nombres: ["Elegí Mendoza"], anios: [2023], color: "#6ca6d5" },
    { nombres: ["Cambia Mendoza"], color: "#000000" },
  ];
  const withColors = buildPartyRegistry(
    entries,
    ["Partido Verde", "Elegí Mendoza", "Cambia Mendoza", "Mejor Mendoza"].map((n) => mention(n)),
    official,
  );

  test("sin color en partidos.yaml, el oficial de la boleta, el de la última elección", () => {
    expect(withColors.ref("Partido Verde")?.color).toBe("#7e984d");
    expect(withColors.ref("Elegí Mendoza")?.color).toBe("#6ca6d5");
  });

  test("el color curado en partidos.yaml gana, y sin fuente oficial no hay color", () => {
    expect(withColors.ref("Cambia Mendoza")?.color).toBe("#951b81");
    expect(withColors.ref("Mejor Mendoza")?.color).toBeNull();
  });
});
