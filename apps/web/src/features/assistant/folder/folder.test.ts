import { describe, expect, test } from "bun:test";
import { buildFolderContent, type StepsBlock } from "./content.ts";
import { buildFolderPdf } from "./pdf.ts";

const block: StepsBlock = {
  type: "steps",
  flow: "abrir-un-comercio",
  title: "Abrir un comercio",
  activity: "Almacén",
  municipality: "Godoy Cruz",
  verified: "2026-10-26",
  steps: [
    {
      level: "nacion",
      agency: "ARCA",
      title: "CUIT y alta en el monotributo",
      detail: "En línea y gratis.",
      href: "https://example.gob.ar/a",
    },
    {
      level: "provincia",
      agency: "ATM",
      title: "Ingresos Brutos",
      detail: "Automática.",
      href: "https://example.gob.ar/b",
      verified: "2026-10-20",
    },
    {
      level: "municipio",
      agency: "Municipalidad de Godoy Cruz",
      title: "Habilitación",
      detail: "Con turno.",
      href: `https://example.gob.ar/${"x".repeat(200)}`,
    },
  ],
  unpublished: [{ what: "Cuánto tarda la habilitación", agency: "Municipalidad de Godoy Cruz" }],
};

describe("folder content", () => {
  const c = buildFolderContent(block, "https://mendoza-transparente.com", "2026-10-27");
  test("groups the steps by level, keeping their order", () => {
    expect(c.groups.map((g) => g.heading)).toEqual(["Nación", "Provincia de Mendoza", "Municipalidad de Godoy Cruz"]);
    expect(c.groups[2]!.steps[0]!.number).toBe(3);
    expect(c.groups[1]!.steps[0]!.verified).toBe("20 oct 2026");
    expect(c.groups[0]!.steps[0]!.verified).toBe("26 oct 2026");
  });
  test("says what is not published as «<agency> no publica …»", () => {
    expect(c.unpublished).toEqual(["Municipalidad de Godoy Cruz no publica cuánto tarda la habilitación."]);
  });
  test("falls back to one box per step when the block lists no papers", () => {
    expect(c.checklist).toHaveLength(3);
    expect(buildFolderContent({ ...block, papers: ["DNI"] }, "x", "2026-10-27").checklist).toEqual(["DNI"]);
  });
  test("has the title, the date and the warning", () => {
    expect(c.subtitle).toBe("Almacén · Godoy Cruz");
    expect(c.downloaded).toBe("Bajada el 27 oct 2026");
    expect(c.footer.join(" ")).toContain("Puede tener errores");
  });
});

describe("folder pdf", () => {
  test("makes a PDF, even with a URL longer than the line", async () => {
    const blob = await buildFolderPdf(buildFolderContent(block, "https://mendoza-transparente.com", "2026-10-27"));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(2000);
  });
});
