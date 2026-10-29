import { expect, test } from "bun:test";
import { MUNICIPALITIES } from "@mt/assistant/types";
import { slug } from "@/slug.ts";
import { suggestionsFor } from "./suggestions.ts";

const PATHS = [
  "/",
  "/coparticipacion",
  "/proveedores",
  "/proveedores/eco-clean-s-a-s-30712345678",
  "/organismos/salud",
  "/gobierno",
  "/gobierno/salud",
  "/leyes",
  "/leyes/9070",
  "/no-publicado",
  "/recaudacion",
  "/deuda",
  "/empleo-publico",
  "/poblacion",
  "/senales",
  "/funcionarios",
  "/partidos",
  "/municipios",
  "/tramites/abrir-un-comercio",
  "/municipios/maipu/tasas",
  "/desconocida",
  ...MUNICIPALITIES.map((m) => `/municipios/${slug(m)}`),
];

test("cada ruta tiene tres sugerencias de una línea", () => {
  for (const path of PATHS) {
    const list = suggestionsFor(path);
    expect(list).toHaveLength(3);
    for (const q of list) {
      expect(q.length).toBeLessThanOrEqual(32);
      expect(q.startsWith("¿") && q.endsWith("?")).toBe(true);
    }
  }
});

test("la ficha de un municipio usa su nombre", () => {
  expect(suggestionsFor("/municipios/godoy-cruz")[0]).toContain("Godoy Cruz");
  expect(suggestionsFor("/municipios/capital")[0]).toContain("la Capital");
});

test("una ruta desconocida da las de siempre, con barra final o query", () => {
  const fallback = suggestionsFor("/desconocida");
  expect(fallback[0]).toBe("¿Cómo abro un comercio?");
  expect(suggestionsFor("/otra/cosa/?x=1")).toEqual(fallback);
  expect(suggestionsFor("/municipios/inexistente")[0]).not.toContain("inexistente");
});
