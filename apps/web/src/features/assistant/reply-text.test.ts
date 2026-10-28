import { describe, expect, test } from "bun:test";
import type { Block } from "@mt/assistant/types";
import { allowedHrefs, normalizeHref, parseReplyText, plainReplyText } from "./reply-text.ts";

const card: Block = {
  type: "data",
  card: {
    title: "San Rafael",
    rows: [{ label: "Intendente", value: "Omar Félix", href: "/autoridades/omar-felix" }],
    link: { label: "Ver el municipio", href: "/municipios/san-rafael" },
  },
};

describe("parseReplyText", () => {
  test("la negrita deja de verse con asteriscos", () => {
    expect(parseReplyText("Tenemos el trámite **abrir un comercio**.")).toEqual([
      {
        kind: "p",
        inlines: [
          { type: "text", value: "Tenemos el trámite " },
          { type: "strong", value: "abrir un comercio" },
          { type: "text", value: "." },
        ],
      },
    ]);
  });

  test("un link que trajo una herramienta se abre dentro del sitio, aunque venga con el dominio", () => {
    const allowed = allowedHrefs([card]);
    const [p] = parseReplyText("Mirá [la ficha](https://mendoza-transparente.com/municipios/san-rafael/).", allowed);
    expect(p?.inlines[1]).toEqual({ type: "link", label: "la ficha", href: "/municipios/san-rafael", internal: true });
  });

  test("un link que no salió de una herramienta queda como texto", () => {
    const [p] = parseReplyText("Ver [el sitio oficial](https://sanrafael.gov.ar).", allowedHrefs([card]));
    expect(p?.inlines).toEqual([{ type: "text", value: "Ver el sitio oficial." }]);
  });

  test("las listas con guion o número son ítems", () => {
    const paragraphs = parseReplyText("Tenés que:\n- sacar el CUIT\n2. pedir la habilitación");
    expect(paragraphs.map((p) => p.kind)).toEqual(["p", "li", "li"]);
  });

  test("un asterisco suelto o una palabra con guion bajo no se toman como formato", () => {
    const [p] = parseReplyText("5 * 3 y asistente_datos");
    expect(p?.inlines).toEqual([{ type: "text", value: "5 * 3 y asistente_datos" }]);
  });
});

test("normalizeHref", () => {
  expect(normalizeHref("https://www.mendoza-transparente.com/leyes/")).toBe("/leyes");
  expect(normalizeHref("https://mendoza-transparente.com")).toBe("/");
  expect(normalizeHref("https://ejemplo.gob.ar/a")).toBe("https://ejemplo.gob.ar/a");
});

test("plainReplyText saca las marcas para el lector de pantalla", () => {
  expect(plainReplyText("Tenemos **abrir un comercio**.\n\n- uno")).toBe("Tenemos abrir un comercio. uno");
});
