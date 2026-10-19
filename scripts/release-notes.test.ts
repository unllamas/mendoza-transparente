import { describe, expect, test } from "bun:test";
import { buildNotes, type Commit, previousReleaseTag } from "./release-notes";

const commit = (subject: string, body = ""): Commit => ({ sha: "x", subject, body });

describe("buildNotes", () => {
  test("groups by type and scope, and folds automatic data updates into one line", () => {
    const notes = buildNotes(
      [
        commit("feat(web): botón «Compartir» (#4)"),
        commit("fix(web): el menú no se corta (#5)"),
        commit("feat(scrapers): Godoy Cruz en el presupuesto (#15)"),
        commit("chore(data): actualización automática (indices)"),
        commit("chore(data): actualización automática (indices, dnap)"),
        commit("docs(skills): la regla de una sola línea"),
        commit("chore(release): 2026-10-17"),
        commit("Mapa: el departamento se pinta (#9)"),
      ],
      ["indices"],
    );
    expect(notes).toContain("### Nuevo\n\n- **Sitio** · botón «Compartir» (#4)");
    expect(notes).toContain("### Arreglos\n\n- **Sitio** · el menú no se corta (#5)");
    expect(notes).toContain("- **Fuentes** · Godoy Cruz en el presupuesto (#15)");
    expect(notes).toContain("- 2 actualizaciones automáticas: `indices` (2), `dnap`");
    expect(notes).toContain("- Datos publicados que cambiaron: `indices`");
    expect(notes).toContain("### Documentación\n\n- **Skills** · la regla de una sola línea");
    expect(notes).toContain("### Otros cambios\n\n- Mapa: el departamento se pinta (#9)");
    expect(notes).not.toContain("2026-10-17");
  });

  test("lists breaking changes first", () => {
    const notes = buildNotes([commit("feat(data)!: monto_total pasa a monto_pesos", "BREAKING CHANGE: usar monto_pesos.")]);
    expect(notes.startsWith("### Cambios que rompen un contrato\n\n- monto_total pasa a monto_pesos: usar monto_pesos.")).toBe(true);
  });

  test("drops the Cloudflare skip marker, and the back merges that carry it", () => {
    const notes = buildNotes([
      commit("chore(data): copias en archive.org [CF-Pages-Skip]"),
      commit("chore: back merge main → dev [CF-Pages-Skip]"),
    ]);
    expect(notes).toContain("copias en archive.org");
    expect(notes).not.toContain("CF-Pages-Skip");
    expect(notes).not.toContain("back merge");
  });
});

describe("previousReleaseTag", () => {
  const tags = ["2026-10-18.2", "2026-10-18", "v1", "2026-10-17"];

  test("skips the day's own releases, so they are rebuilt instead of stacked", () => {
    expect(previousReleaseTag(tags, "2026-10-18")).toBe("2026-10-17");
  });

  test("takes the latest release of an earlier day, old suffixed tags included", () => {
    expect(previousReleaseTag(tags, "2026-10-19")).toBe("2026-10-18.2");
    expect(previousReleaseTag(tags, "2026-10-17")).toBeUndefined();
  });
});
