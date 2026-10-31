import { describe, expect, test } from "bun:test";

import { draftItems, draftYaml, mondayOf } from "./weekly-update.ts";

describe("draftItems", () => {
  test("se queda con los feat que ve la gente, sin repetidos", () => {
    expect(
      draftItems([
        "feat(web): páginas de partidos (#84)",
        "fix(web): un arreglo (#85)",
        "feat(panel): vista interna (#86)",
        "feat(ui): skeleton sin parpadeo (#156) [cf-pages-skip]",
        "feat: buscador por apellido",
        "feat(web): páginas de partidos (#84)",
      ]),
    ).toEqual([
      { title: "páginas de partidos", pr: "84" },
      { title: "skeleton sin parpadeo", pr: "156" },
      { title: "buscador por apellido" },
    ]);
  });
});

describe("mondayOf", () => {
  test("devuelve el lunes de la semana", () => {
    expect(mondayOf("2026-10-31")).toBe("2026-10-26");
    expect(mondayOf("2026-10-26")).toBe("2026-10-26");
    expect(mondayOf("2026-11-01")).toBe("2026-10-26");
  });
});

describe("draftYaml", () => {
  test("arma un borrador que no se publica, con el título entre comillas", () => {
    const yaml = draftYaml("2026-10-26", [{ title: "Aco: el asistente", pr: "113" }], "https://x/compare/a...b");
    expect(yaml).toContain("borrador: true\n");
    expect(yaml).toContain(`  - titulo: "Aco: el asistente"\n`);
    expect(yaml).toContain("/pull/113");
  });
});
