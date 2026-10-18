import { describe, expect, test } from "bun:test";
import { clip, detectKind, grepLines, render } from "./inspect-render.ts";

const enc = (s: string) => new TextEncoder().encode(s);
const OPTS = { max: 3000, rows: 8 };

describe("detectKind", () => {
  test("por extensión, aunque esté comprimido", () => {
    expect(detectKind("anexo2.pdf.gz", enc("x"))).toBe("pdf");
    expect(detectKind("muni.xls", enc("x"))).toBe("sheet");
  });
  test("por contenido cuando la URL no tiene extensión", () => {
    expect(detectKind("/informacion-publica/", enc("<!DOCTYPE html><html>"))).toBe("html");
    expect(detectKind("/api/boe", enc('{"a":1}'))).toBe("json");
    expect(detectKind("/descarga", enc("%PDF-1.4"))).toBe("pdf");
  });
});

describe("clip y grepLines", () => {
  test("avisa cuánto recortó", () => {
    expect(clip("abcdef", 3)).toStartWith("abc\n… (recortado: 3 caracteres más");
    expect(clip("abc", 3)).toBe("abc");
  });
  test("muestra la línea que cumple con una de contexto", () => {
    expect(grepLines("uno\ndos\ntres\ncuatro", /tres/, 1000)).toBe("--\n2: dos\n3: tres\n4: cuatro");
  });
});

describe("render de HTML", () => {
  const html = `<html><head><title>LRF</title><script>var x=1</script></head><body>
    <h1>Ley de Responsabilidad Fiscal</h1>
    <a href="/2024/"></a><a href="/2024/">2024\u{E0FF}</a>
    <a href="anexo2.pdf">Anexo 2</a>
    <p>Texto​ visible</p></body></html>`;

  test("lista solo los links a documentos, resueltos contra la URL", async () => {
    const out = await render("index.html", enc(html), OPTS, { url: "https://muni.gob.ar/lrf/" });
    expect(out).toContain("Links a documentos: 1 de 2");
    expect(out).toContain("- Anexo 2 → https://muni.gob.ar/lrf/anexo2.pdf");
    expect(out).not.toContain("var x");
  });

  test("una URL repetida queda con el texto que no está vacío", async () => {
    const out = await render("index.html", enc(html), { ...OPTS, links: true }, { url: "https://muni.gob.ar/lrf/" });
    expect(out).toContain("- 2024 → https://muni.gob.ar/2024/");
    expect(out).toContain("Texto visible");
  });
});
