/**
 * Quién es cada proveedor del Estado: cruza los CUIT de las adjudicaciones de COMPR.AR
 * con el Registro Nacional de Sociedades (Ministerio de Justicia, datos abiertos).
 *
 * El registro completo pesa ~900 MB descomprimido (~120 MB en ZIP): se baja a un
 * directorio temporal, se procesa en streaming y en data/raw se archiva sólo un extracto
 * con las filas de los CUIT de interés, más un JSON con URL y sha256 del original.
 *
 * Privacidad: para personas humanas (CUIT 20/23/24/27) no se busca ni se guarda nada
 * más que el CUIT y el nombre tal como figura en COMPR.AR.
 */

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Unzip, UnzipInflate } from "fflate";
import { archive, get, PROCESSED_DIR, writeProcessed } from "@mt/core";

const SOURCE = "proveedores";
const CKAN = "https://datos.jus.gob.ar/api/3/action/package_show?id=registro-nacional-de-sociedades";
const DATASET_URL = "https://datos.jus.gob.ar/dataset/registro-nacional-de-sociedades";
const ADJ = join(PROCESSED_DIR, "compras-ocds", "adjudicaciones.csv");
const TMP = join(tmpdir(), "mt-proveedores");

interface Resource {
  name: string;
  url: string;
  format: string;
  last_modified: string | null;
}

/** Parsea una línea CSV (sin saltos de línea fuera de comillas). */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const quoteCount = (s: string) => {
  let n = 0;
  for (let i = s.indexOf('"'); i !== -1; i = s.indexOf('"', i + 1)) n++;
  return n;
};

/** Lee adjudicaciones.csv completo (es chico) respetando comillas y saltos de línea. */
function parseCsvText(text: string): Record<string, string>[] {
  const records: string[] = [];
  let pending = "";
  for (const raw of text.split("\n")) {
    const line = pending ? pending + "\n" + raw : raw;
    if (quoteCount(line) % 2 === 1) {
      pending = line;
      continue;
    }
    pending = "";
    records.push(line.replace(/\r$/, ""));
  }
  const header = parseCsvLine(records[0]!);
  return records
    .slice(1)
    .filter(Boolean)
    .map((l) => {
      const f = parseCsvLine(l);
      return Object.fromEntries(header.map((h, i) => [h, f[i] ?? ""]));
    });
}

/** Descarga a disco en streaming y devuelve sha256 y tamaño. */
async function download(url: string, dest: string): Promise<{ sha256: string; bytes: number }> {
  const resp = await get(url);
  const hash = createHash("sha256");
  let bytes = 0;
  const src = Readable.fromWeb(resp.body as import("node:stream/web").ReadableStream);
  src.on("data", (chunk: Buffer) => {
    hash.update(chunk);
    bytes += chunk.length;
  });
  await pipeline(src, createWriteStream(dest));
  return { sha256: hash.digest("hex"), bytes };
}

/** Recorre línea por línea el CSV (o el único CSV dentro de un ZIP) sin cargarlo en memoria. */
async function eachLine(path: string, onLine: (line: string) => void) {
  const dec = new TextDecoder("utf-8");
  let rest = "";
  const feed = (chunk: Uint8Array, final: boolean) => {
    rest += dec.decode(chunk, { stream: !final });
    let i: number;
    let start = 0;
    while ((i = rest.indexOf("\n", start)) !== -1) {
      onLine(rest.slice(start, i).replace(/\r$/, ""));
      start = i + 1;
    }
    rest = rest.slice(start);
    if (final && rest) onLine(rest);
  };

  if (!path.endsWith(".zip")) {
    for await (const chunk of createReadStream(path)) feed(chunk as Buffer, false);
    feed(new Uint8Array(), true);
    return;
  }

  let csvSeen = 0;
  await new Promise<void>((resolve, reject) => {
    const uz = new Unzip((file) => {
      if (!file.name.endsWith(".csv")) return;
      csvSeen++;
      if (csvSeen > 1) throw new Error("El ZIP trae más de un CSV: se esperaba un snapshot único");
      file.ondata = (err, data, final) => {
        if (err) return reject(err);
        feed(data, final);
        if (final) resolve();
      };
      file.start();
    });
    uz.register(UnzipInflate);
    (async () => {
      for await (const chunk of createReadStream(path)) uz.push(chunk as Buffer);
      uz.push(new Uint8Array(), true);
    })().catch(reject);
  });
}

const TIPOS: [RegExp, string][] = [
  [/^SOCIEDAD ANONIMA UNIPERSONAL$/, "S.A.U."],
  [/^SOCIEDAD ANONIMA CON PARTICIPACION ESTATAL MAYORITARIA$/, "S.A.P.E.M."],
  [/^SOCIEDAD ANONIMA$/, "S.A."],
  [/^SOCIEDAD DE RESPONSABILIDAD LIMITADA$/, "S.R.L."],
  [/^SOCIEDAD POR ACCION SIMPLIFICADA$/, "S.A.S."],
  [/^SOCIEDAD EN COMANDITA POR ACCIONES$/, "S.C.A."],
  [/^SOCIEDAD EN COMANDITA SIMPLE$/, "S.C.S."],
  [/^SOCIEDAD COLECTIVA$/, "Sociedad colectiva"],
  [/^SOCIEDAD LEY 19550 CAPITULO I SECCION IV$/, "Sociedad de la Sección IV (Ley 19.550)"],
  [/^SOCIEDAD DEL ESTADO$/, "Sociedad del Estado"],
  [/^COOPERATIVA EFECTORA$/, "Cooperativa efectora"],
  [/^COOPERATIVA$/, "Cooperativa"],
  [/^ASOCIACION CIVIL$/, "Asociación civil"],
  [/^ASOCIACION COOPERADORA$/, "Asociación cooperadora"],
  [/^ASOCIACION MUTUAL$/, "Asociación mutual"],
  [/^FUNDACION$/, "Fundación"],
  [/^SUCURSAL EMPRESA EXTRANJERA$/, "Sucursal de empresa extranjera"],
  [/^SOCIEDAD EXTRANJERA$/, "Sociedad extranjera"],
  [/^SIMPLE ASOCIACION$/, "Simple asociación"],
  [/^GARANTIA RECIPROCA$/, "Sociedad de garantía recíproca"],
  [/^ECONOMIA MIXTA$/, "Economía mixta"],
  [/^CAPITAL E INDUSTRIA$/, "Capital e industria"],
];

function tipoSocietario(raw: string): string {
  const t = raw.trim().toUpperCase();
  if (!t) return "";
  for (const [re, label] of TIPOS) if (re.test(t)) return label;
  const s = t.toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fechaIso(raw: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  if (!m) return "";
  if (m[1] === "1901" && m[2] === "01" && m[3] === "01") return ""; // marcador de "sin dato"
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== `${m[1]}-${m[2]}-${m[3]}`) return "";
  return `${m[1]}-${m[2]}-${m[3]}`;
}

const title = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/(^|[\s.(/-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/\b(De|Del|La|Las|Los|Y|El)\b/g, (w) => w.toLowerCase())
    .replace(/^./, (c) => c.toUpperCase());

const tipoPersona = (cuit: string) =>
  /^(30|33|34)/.test(cuit) ? "juridica" : /^(20|23|24|27)/.test(cuit) ? "humana" : "";

export async function run(_args: string[]) {
  // 1. CUIT de las adjudicaciones.
  const adjRows = parseCsvText(await readFile(ADJ, "utf8"));
  const nombres = new Map<string, string>();
  const primera = new Map<string, string>();
  for (const r of adjRows) {
    const cuit = (r.proveedor_cuit ?? "").replace(/\D/g, "");
    if (cuit.length !== 11) continue;
    if (!nombres.has(cuit)) nombres.set(cuit, (r.proveedor_nombre ?? "").trim());
    const f = r.fecha_adjudicacion ?? "";
    if (f && (!primera.has(cuit) || f < primera.get(cuit)!)) primera.set(cuit, f);
  }
  const juridicos = new Set([...nombres.keys()].filter((c) => tipoPersona(c) === "juridica"));
  console.log(`CUIT en adjudicaciones: ${nombres.size} (${juridicos.size} jurídicos)`);

  // 2. Recursos del registro (CKAN): snapshots anuales completos más recientes.
  const pkg = (await (await get(CKAN)).json()) as { result: { metadata_modified: string; resources: Resource[] } };
  const resources = pkg.result.resources.filter((r) => r.format === "ZIP" || r.format === "CSV");
  const anual = resources
    .filter((r) => /^Registro Nacional de Sociedades -\s+\d{4}$/.test(r.name.trim()) && r.format === "ZIP")
    .sort((a, b) => (b.last_modified ?? "").localeCompare(a.last_modified ?? ""))[0];
  const asfl = resources
    .filter((r) => /Asociaciones sin fines de lucro - \d{8}$/.test(r.name.trim()) && r.format === "CSV")
    .sort((a, b) => (b.last_modified ?? "").localeCompare(a.last_modified ?? ""))[0];
  if (!anual) throw new Error("No se encontró el snapshot anual del registro en CKAN");
  const fuentes = [anual, ...(asfl ? [asfl] : [])];

  await mkdir(TMP, { recursive: true });
  const header: string[] = [];
  let headerLine = "";
  const extracto: string[] = [];
  const registro = new Map<string, Record<string, string>[]>();
  const origen: Record<string, unknown>[] = [];

  for (const res of fuentes) {
    const file = join(TMP, res.url.split("/").pop()!);
    let info: { sha256: string; bytes: number };
    if (existsSync(file) && existsSync(file + ".sha256")) {
      info = JSON.parse(await readFile(file + ".sha256", "utf8"));
      if ((await stat(file)).size !== info.bytes) info = await download(res.url, file);
    } else info = await download(res.url, file);
    await Bun.write(file + ".sha256", JSON.stringify(info));
    console.log(`${res.name}: ${(info.bytes / 1e6).toFixed(1)} MB sha256 ${info.sha256.slice(0, 12)}…`);
    origen.push({
      recurso: res.name,
      url: res.url,
      ultima_modificacion: res.last_modified,
      sha256: info.sha256,
      bytes: info.bytes,
    });

    let lineNo = 0;
    let pending = "";
    let total = 0;
    await eachLine(file, (raw) => {
      const l0 = lineNo++ === 0 ? raw.replace(/^﻿/, "") : raw;
      if (l0 === raw && lineNo === 1) {
        // sin BOM
      }
      if (lineNo === 1) {
        if (!headerLine) {
          headerLine = l0;
          header.push(...parseCsvLine(l0));
        }
        return;
      }
      let line = l0;
      if (pending) {
        line = pending + "\n" + l0;
        if (quoteCount(line) % 2 === 1) {
          pending = line;
          return;
        }
        pending = "";
      } else {
        const prefix = line.slice(0, 11);
        if (!juridicos.has(prefix) || line[11] !== ",") return;
        if (quoteCount(line) % 2 === 1) {
          pending = line;
          return;
        }
      }
      const f = parseCsvLine(line);
      if (!juridicos.has(f[0]!)) return;
      total++;
      extracto.push(line);
      const rec = Object.fromEntries(header.map((h, i) => [h, f[i] ?? ""]));
      rec._recurso = res.url;
      const arr = registro.get(f[0]!) ?? [];
      arr.push(rec);
      registro.set(f[0]!, arr);
    });
    console.log(`  filas del extracto: ${total}`);
  }

  // 3. Archivar extracto y trazabilidad.
  const extractoCsv = headerLine + "\n" + extracto.join("\n") + "\n";
  const a1 = await archive(SOURCE, "extracto-registro-sociedades.csv", extractoCsv, { url: anual.url });
  const a2 = await archive(
    SOURCE,
    "origen-registro-sociedades.json",
    JSON.stringify(
      {
        dataset: DATASET_URL,
        api: CKAN,
        dataset_modificado: pkg.result.metadata_modified,
        archivos_originales: origen,
        nota: "Los archivos originales (~900 MB descomprimidos) no se archivan: data/raw guarda sólo el extracto con las filas de los CUIT jurídicos de las adjudicaciones.",
        cuit_buscados: juridicos.size,
        cuit_encontrados: registro.size,
      },
      null,
      2,
    ),
    { url: DATASET_URL },
  );
  console.log(`archivado: ${a1 ?? "(sin cambios)"} ${a2 ?? "(sin cambios)"}`);

  // 4. Una fila por CUIT.
  const rows = [...nombres.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cuit, nombre]) => {
      const tp = tipoPersona(cuit);
      const base = {
        cuit,
        razon_social: nombre,
        tipo_persona: tp,
        tipo_societario: "",
        fecha_constitucion: "",
        provincia: "",
        localidad: "",
        actividad: "",
        encontrado_en_registro: "no",
        fuente_url: "",
      };
      if (tp !== "juridica") return base;
      const recs = registro.get(cuit);
      if (!recs) return base;
      const r = recs[0]!;
      // Actividad principal: la de menor orden con descripción.
      const act = recs
        .filter((x) => x.actividad_descripcion)
        .sort((a, b) => Number(a.actividad_orden || 99) - Number(b.actividad_orden || 99))[0];
      const prov = r.dom_fiscal_provincia || r.dom_legal_provincia;
      const loc = r.dom_fiscal_provincia ? r.dom_fiscal_localidad : r.dom_legal_localidad;
      return {
        ...base,
        razon_social: r.razon_social?.trim() || nombre,
        tipo_societario: tipoSocietario(r.tipo_societario ?? ""),
        fecha_constitucion: fechaIso(r.fecha_hora_contrato_social ?? ""),
        provincia: title(prov ?? ""),
        localidad: title(loc ?? ""),
        actividad: act?.actividad_descripcion ?? "",
        encontrado_en_registro: "si",
        fuente_url: DATASET_URL,
      };
    });

  const columns = [
    "cuit",
    "razon_social",
    "tipo_persona",
    "tipo_societario",
    "fecha_constitucion",
    "provincia",
    "localidad",
    "actividad",
    "encontrado_en_registro",
    "fuente_url",
  ];
  await writeProcessed(SOURCE, "proveedores.csv", rows, columns);

  const meta = {
    titulo: "Proveedores del Estado: quién es cada uno",
    descripcion:
      "Cada fila es un CUIT que ganó al menos una adjudicación en COMPR.AR Mendoza, cruzado con el Registro Nacional de Sociedades (Ministerio de Justicia de la Nación, datos abiertos, suministrados por ARCA). Para personas humanas solo se muestra el CUIT y el nombre que figura en COMPR.AR. Si un CUIT jurídico no aparece en el registro, se deja el nombre de COMPR.AR y los demás campos vacíos.",
    columnas: {
      cuit: { etiqueta: "CUIT", tipo: "texto" },
      razon_social: {
        etiqueta: "Razón social",
        tipo: "texto",
        descripcion: "Del Registro Nacional de Sociedades si se encontró; si no, el nombre que figura en COMPR.AR.",
      },
      tipo_persona: {
        etiqueta: "Tipo de persona",
        tipo: "texto",
        valores: { juridica: "Persona jurídica", humana: "Persona humana" },
        descripcion: "Según el prefijo del CUIT: 30, 33 y 34 jurídica; 20, 23, 24 y 27 humana.",
      },
      tipo_societario: { etiqueta: "Tipo societario", tipo: "texto", descripcion: "S.A., S.R.L., S.A.S., cooperativa, etc." },
      fecha_constitucion: {
        etiqueta: "Fecha de constitución",
        tipo: "fecha",
        descripcion: "Fecha del contrato social según el registro. Vacía si el registro no la informa.",
      },
      provincia: { etiqueta: "Provincia", tipo: "texto", descripcion: "Del domicilio fiscal (o legal si falta)." },
      localidad: { etiqueta: "Localidad", tipo: "texto" },
      actividad: { etiqueta: "Actividad", tipo: "texto", descripcion: "Actividad principal declarada ante ARCA, cuando existe." },
      encontrado_en_registro: {
        etiqueta: "En el registro",
        tipo: "texto",
        valores: { si: "Sí", no: "No" },
        descripcion: "Si el CUIT se encontró en el Registro Nacional de Sociedades. Las personas humanas no se buscan.",
      },
      fuente_url: { etiqueta: "Fuente", tipo: "url" },
    },
    orden: [
      "razon_social",
      "tipo_societario",
      "fecha_constitucion",
      "provincia",
      "localidad",
      "actividad",
      "tipo_persona",
      "cuit",
      "encontrado_en_registro",
      "fuente_url",
    ],
  };
  await Bun.write(join(PROCESSED_DIR, SOURCE, "proveedores.meta.json"), JSON.stringify(meta, null, 2) + "\n");

  // 5. Verificación.
  const enc = rows.filter((r) => r.tipo_persona === "juridica" && r.encontrado_en_registro === "si").length;
  console.log(`Jurídicos: ${juridicos.size}; encontrados: ${enc} (${((100 * enc) / juridicos.size).toFixed(1)} %)`);
  console.log(`Humanos: ${rows.filter((r) => r.tipo_persona === "humana").length}; sin clasificar: ${rows.filter((r) => !r.tipo_persona).length}`);
  for (const c of ["30716663511", "30707363971"]) console.log(JSON.stringify(rows.find((r) => r.cuit === c)));

  // Primera adjudicación con menos de 12 meses de constituida.
  const jovenes: { cuit: string; nombre: string; constituida: string; primera: string; monto: number }[] = [];
  for (const r of rows) {
    if (!r.fecha_constitucion) continue;
    const p = primera.get(r.cuit);
    if (!p) continue;
    const lim = new Date(r.fecha_constitucion + "T00:00:00Z");
    lim.setUTCMonth(lim.getUTCMonth() + 12);
    if (p < r.fecha_constitucion || p >= lim.toISOString().slice(0, 10)) continue;
    const monto = adjRows
      .filter((a) => a.proveedor_cuit === r.cuit && a.fecha_adjudicacion === p)
      .reduce((s, a) => s + Number(a.monto || 0), 0);
    jovenes.push({ cuit: r.cuit, nombre: r.razon_social, constituida: r.fecha_constitucion, primera: p, monto });
  }
  console.log(`Primera adjudicación con <12 meses de constituida: ${jovenes.length}`);
  for (const j of jovenes.sort((a, b) => b.monto - a.monto).slice(0, 5)) console.log(JSON.stringify(j));
}
