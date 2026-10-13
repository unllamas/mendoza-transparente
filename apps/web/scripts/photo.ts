/**
 * Brings a landscape photo from Wikimedia Commons into the site, for `DotPhoto`.
 *
 *   bun scripts/photo.ts "<Commons file name>" <id>
 *
 * Saves a small copy (the dots don't need more) in `public/fotos/<id>.jpg` and prints
 * the entry for `src/photos.ts` with author, license and link, which the license requires.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

// 500 px is one of Commons' standard thumbnail sizes: other widths come back much heavier.
const WIDTH = 500;
const UA = { "User-Agent": "MendozaTransparente/1.0 (+https://mendoza-transparente.com)" };

const [file, id] = process.argv.slice(2);
if (!file || !id || !/^[a-z0-9-]+$/.test(id)) {
  console.error('Uso: bun scripts/photo.ts "<archivo de Commons>" <id-en-kebab-case>');
  process.exit(1);
}

const params = new URLSearchParams({
  action: "query",
  format: "json",
  titles: `File:${file.replace(/^File:/, "")}`,
  prop: "imageinfo",
  iiprop: "url|extmetadata",
  iiurlwidth: String(WIDTH),
});
const res = (await (await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: UA })).json()) as {
  query: {
    pages: Record<string, { imageinfo?: { thumburl: string; descriptionurl: string; extmetadata: Record<string, { value: string }> }[] }>;
  };
};
const info = Object.values(res.query.pages)[0]?.imageinfo?.[0];
if (!info) {
  console.error(`No encontré "${file}" en Commons.`);
  process.exit(1);
}

const plain = (key: string) => (info.extmetadata[key]?.value ?? "").replace(/<[^>]+>/g, "").trim();
const image = await fetch(info.thumburl, { headers: UA });
if (!image.ok) throw new Error(`Commons respondió ${image.status} al bajar la imagen`);

const dir = join(import.meta.dir, "../public/fotos");
await mkdir(dir, { recursive: true });
await Bun.write(join(dir, `${id}.jpg`), await image.arrayBuffer());

console.log(`Guardada en public/fotos/${id}.jpg. Entrada para src/photos.ts (completar title):\n`);
console.log(`  "${id}": {
    src: "/fotos/${id}.jpg",
    title: "",
    author: ${JSON.stringify(plain("Artist"))},
    license: ${JSON.stringify(plain("LicenseShortName"))},
    url: ${JSON.stringify(info.descriptionurl)},
  },`);
console.log(`\nDescripción en Commons: ${plain("ImageDescription")}`);
