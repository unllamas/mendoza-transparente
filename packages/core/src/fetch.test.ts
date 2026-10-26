import { describe, expect, test } from "bun:test";

import { huella } from "./fetch.ts";

const encode = (s: string) => new TextEncoder().encode(s);

/** A GeneXus results page as the official site exports it: the votes are in a hidden field, not in the text. */
const page = (votes: string, state = "abc") => `<html><body>
<span id="W0085TXTMESASESCRUTADOS">1.234</span>
<input type="hidden" name="W0085Grid_votos_cargosContainerDataV_0001" value='[["","Lista"," 6","","${votes} votos - 1.33%"]]'/>
<input type="hidden" name="GXState" value='{"session":"${state}"}'/>
</body></html>`;

describe("huella", () => {
  test("a change of votes in a GeneXus table counts as a change, even with the same counted tables", () => {
    expect(huella("p.html", encode(page("356")))).not.toBe(huella("p.html", encode(page("357"))));
  });

  test("GeneXus session state does not count as a change", () => {
    expect(huella("p.html", encode(page("356", "abc")))).toBe(huella("p.html", encode(page("356", "xyz"))));
  });

  test("scripts and nonces in links do not count as a change", () => {
    const html = (nonce: string) => `<p>Hola</p><a href="/x?_wpnonce=${nonce}">x</a><script>var t="${nonce}"</script>`;
    expect(huella("p.html", encode(html("1")))).toBe(huella("p.html", encode(html("2"))));
  });
});
