import { describe, expect, test } from "bun:test";
import { anchorOf, section } from "./doc-section.ts";

const doc = ["# Diseño", "", "## Color", "celeste", "### Contraste", "4,5:1", "## Gráficos", "```", "## no es un título", "```", "barras"];

describe("seccion", () => {
  test("una sección llega hasta el próximo título de su nivel e incluye sus subsecciones", () => {
    expect(section(doc, "color", false)).toBe("## Color\nceleste\n### Contraste\n4,5:1");
  });
  test("ignora tildes y los títulos dentro de bloques de código", () => {
    expect(section(doc, "graficos", false)).toBe("## Gráficos\n```\n## no es un título\n```\nbarras");
  });
  test("busca por el ancla de los links", () => {
    expect(anchorOf("Velocidad de carga")).toBe("velocidad-de-carga");
    expect(section(doc, "contraste", true)).toBe("### Contraste\n4,5:1");
  });
});
