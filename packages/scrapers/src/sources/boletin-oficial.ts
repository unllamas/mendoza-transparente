/**
 * Boletín Oficial de Mendoza (API no documentada de portalgateway.mendoza.gov.ar).
 *
 * Uso: bun run scrape boletin-oficial [--desde YYYY-MM-DD] [--hasta YYYY-MM-DD] [--solo-tipo=ley[,tipo2]]
 *      (por defecto, hoy)
 *      bun run scrape boletin-oficial --ids=<id,id,...>
 *
 * --solo-tipo=<tipos>  Backfill liviano: recorre todas las ediciones del rango y archiva el índice de cada una,
 *   pero solo baja el detalle (texto completo) de las normas de esos tipos (lista separada por comas; el tipo es
 *   el del índice en minúscula: ley, decreto, resolucion...). Las demás normas se agregan a normas.csv con los
 *   datos del índice (sumario = lo que dice el índice, sin texto ni categoría) si todavía no están; un
 *   corrida normal posterior les baja el detalle. Nunca borra ni pisa filas existentes; se puede cortar y
 *   retomar (lo ya bajado se saltea).
 *
 * --ids=<id,id,...>  Baja el detalle (texto completo) de normas que ya están en normas.csv solo con el dato del
 *   índice, sin recorrer ediciones. Sirve para completar las que dejó el backfill liviano cuando una fuente
 *   derivada las necesita (por ejemplo, los decretos de misión oficial de `misiones-oficiales`).
 *
 * titulo_ley (solo leyes): objeto de la ley, tomado de la primera oración del artículo 1 (el texto publicado no
 *   trae título), hasta ~180 caracteres.
 *
 * Endpoints (todos POST form-urlencoded salvo `current`):
 *  - find   fecha                  -> cabecera de la edición (data-boe-nro). Cuerpo "0" si no hubo edición.
 *  - index  fecha, numero          -> índice completo (normas y edictos). El <a data-id> es el norma_edicto_id
 *           y data-fecha la fecha de la norma (no la de la edición).
 *  - detail tipo_busqueda=norma, norma_edicto_id, fecha_desde (= fecha de la norma),
 *           fecha_hasta (= fecha de la edición, OBLIGATORIA: sin ella responde 502), tipo_boletin=2
 *  - supplement/index  fecha, numero -> suplementos; las normas listadas ya están en `index` (se unen igual).
 *
 * Crudo: índice y detalle de cada norma (de los edictos solo el índice).
 * Salida: data/processed/boletin-oficial/normas.csv (acumulativo, idempotente por norma_id) y
 *         data/processed/boletin-oficial/textos/<fecha>/<norma_id>.txt
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { archive, collapseSpaces, get, PROCESSED_DIR, type Row, sleep, writeProcessed } from "@mt/core";
import * as cheerio from "cheerio";

const SOURCE = "boletin-oficial";
const BASE = "https://portalgateway.mendoza.gov.ar/api/boe";
const OUT_DIR = join(PROCESSED_DIR, SOURCE);

const COLUMNS = [
  "fecha",
  "nro_boletin",
  "norma_id",
  "tipo",
  "numero",
  "organismo",
  "expediente",
  "sumario",
  "largo_texto",
  "url_pdf",
  "categoria",
  "fecha_norma",
  "titulo_ley",
];

type Categoria = "designacion" | "contratacion" | "presupuesto" | "coparticipacion" | "deuda" | "ley" | "convocatoria_electoral" | "otro";

interface IndexItem {
  kind: "norma" | "edicto";
  id: string;
  fechaNorma: string; // YYYY-MM-DD
  tipo: string;
  numero: string;
  organismo: string;
  tema: string;
}

/** POST con pausa (~1 s en total con la de get) y espera larga ante 429 (el gateway limita la tasa). */
export async function post(path: string, params: Record<string, string>): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const resp = await get(
        `${BASE}/${path}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(params).toString(),
        },
        1,
      );
      await sleep(500);
      return await resp.text();
    } catch (err) {
      const limitado = /429/.test(String(err));
      // Ante 429 se insiste mucho más (hasta ~1 h acumulada): el límite del gateway se libera con el tiempo.
      if (attempt >= (limitado ? 15 : 5)) throw err;
      await sleep(limitado ? Math.min(20_000 * (attempt + 1), 300_000) : 3_000 * (attempt + 1));
    }
  }
}

/** dd/mm/yyyy o d/m/yyyy -> YYYY-MM-DD */
function dmy(s: string): string {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : "";
}

function parseIndex(html: string, supplement: boolean): IndexItem[] {
  const $ = cheerio.load(html);
  const items: IndexItem[] = [];
  $("li.list-group-item").each((_, li) => {
    const a = $(li)
      .find(supplement ? "a.supplement-detail" : "a.boe-detail")
      .first();
    if (!a.length) return;
    const text = collapseSpaces($(li).text());
    const heading = collapseSpaces($(li).closest(".accordion-item").children("h2").text());
    const label = text.match(/(Decreto|Resoluci[oó]n|Ley|[A-Za-zñÑáéíóúÁÉÍÓÚ ]+?)\s*Nro\.\s*(\S+)/);
    items.push({
      kind: supplement ? "norma" : ((a.attr("data-type") as "norma" | "edicto") ?? "norma"),
      id: (supplement ? a.attr("data-norma-id") : a.attr("data-id")) ?? "",
      fechaNorma: (supplement ? dmy(text.match(/Fecha:\s*([\d/]+)/)?.[1] ?? "") : a.attr("data-fecha")) ?? "",
      tipo: heading
        .toLowerCase()
        .replace(/^leyes$/, "ley")
        .replace(/^decretos$/, "decreto")
        .replace(/^resoluciones$/, "resolucion"),
      numero: label?.[2] ?? "",
      organismo: text.match(/Origen:\s*(.+)$/)?.[1] ?? "",
      tema: collapseSpaces(a.text()),
    });
  });
  return items.filter((i) => i.id);
}

function classify(tipo: string, sumario: string, texto: string): Categoria {
  const art1 = texto.search(/art[ií]culo\s*1\s*[º°o.]/i);
  const t = collapseSpaces(`${sumario} ${texto.slice(0, 700)} ${art1 >= 0 ? texto.slice(art1, art1 + 700) : ""}`);
  if (
    /convoc\w+\s+(a|al)\s+(el\s+)?(cuerpo\s+)?(elecciones|comicios|electoral)|convoc[aá]se[^.]{0,80}(elecciones|comicios)|convocatoria a elecciones/i.test(
      t,
    )
  )
    return "convocatoria_electoral";
  if (tipo === "ley") return "ley";
  if (/coparticipaci|coeficiente de equilibrio|distribuci[oó]n de (los )?recursos[^.]{0,60}municip/i.test(t)) return "coparticipacion";
  if (
    /(emisi[oó]n|colocaci[oó]n)\s+de\s+(t[ií]tulos|letras|bonos|deuda|obligaciones negociables|valores)|endeudamiento|operaci[oó]n de cr[eé]dito|deuda p[uú]blica|letras del tesoro|t[ií]tulos de deuda/i.test(
      t,
    )
  )
    return "deuda";
  if (
    /(ampl[ií]|increment|modif[ií]c|refuerz|reestructur)\w*[^.]{0,80}(presupuesto|c[aá]lculo de recursos)|(presupuesto|c[aá]lculo de recursos)[^.]{0,80}(ampl[ií]|increment|modific|refuerz|reestructur)|cr[eé]ditos? presupuestari/i.test(
      t,
    )
  )
    return "presupuesto";
  if (/adjudic|licitaci[oó]n|contrataci[oó]n directa|concurso de precios|compra directa|contr[aá]tase\b/i.test(t)) return "contratacion";
  if (/\bdes[ií]gn\w*|\bnombr[aá]\w*|\bencom[ií]end\w*[^.]{0,40}(cargo|funciones)|\bd[aá]se por\b/i.test(t)) return "designacion";
  return "otro";
}

/** Texto plano del detalle: conserva saltos de párrafo. */
export function parseDetail(html: string) {
  const $ = cheerio.load(html);
  $("#detail-body br").replaceWith("\n");
  $("#detail-body p, #detail-body div, #detail-body li, #detail-body tr").each((_, el) => {
    $(el).append("\n");
  });
  const texto = $("#detail-body")
    .text()
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const url_pdf =
    $("#detail-header a")
      .filter((_, a) => /pdf_pedido/.test($(a).attr("href") ?? ""))
      .attr("href") ?? "";
  const tema = collapseSpaces(
    $("#detail-sub-header .col")
      .filter((_, c) => /Tema:/.test($(c).text()))
      .first()
      .text()
      .replace("Tema:", ""),
  );
  return { texto, url_pdf, tema };
}

/** Objeto de la ley: primera oración del artículo 1 (después de "SANCIONAN CON FUERZA DE LEY"), hasta ~180 caracteres. */
function tituloLey(texto: string): string {
  const t = texto.replace(/\s+/g, " ");
  const ley = t.match(/FUERZA\s+DE\s+L\s*E\s*Y\s*:?/i);
  let resto = ley ? t.slice(ley.index! + ley[0].length) : t;
  const art = resto.match(/(?:Art[ií]culo|ART\.?)\s*1\s*[º°o.]?\s*[-–.:)]*\s*/i);
  if (art) resto = resto.slice(art.index! + art[0].length);
  resto = resto.replace(/^[\s\-–.:]+/, "");
  // Primera oración: corta en ". " (salvo abreviaturas y números de artículo) o en ":" (fin del encabezado).
  let fin = resto.length;
  for (const m of resto.matchAll(/([.:])\s+(?=[A-ZÁÉÍÓÚa-z"“(])/g)) {
    const antes = resto.slice(Math.max(0, m.index! - 6), m.index!);
    if (
      m[1] === "." &&
      (/(Art|N[º°]|inc|Dr|Dra|Sr|Lic|Ing|Nro|apdo|Depto|Dpto|Pto|Av|Gral|Cnel)$/i.test(antes) ||
        !/[A-ZÁÉÍÓÚ"“(]/.test(resto[m.index! + m[0].length]!))
    )
      continue;
    fin = m.index! + (m[1] === "." ? 1 : 0);
    break;
  }
  let frase = resto.slice(0, fin).trim();
  if (frase.length > 180) {
    const corte = frase.slice(0, 180);
    const coma = corte.lastIndexOf(", ");
    frase = `${(coma > 100 ? corte.slice(0, coma) : corte.replace(/\s+\S*$/, "")).replace(/[\s,;:(–-]+$/, "")}…`;
  }
  return frase;
}

// CSV mínimo con comillas, para releer normas.csv.
function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let row: string[] = [],
    cur = "",
    q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (c !== "\r") cur += c;
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head!.map((h, i) => [h, r[i] ?? ""])));
}

/** Baja el detalle de una norma, guarda su texto y devuelve la fila de normas.csv. */
async function fetchDetail(n: {
  fecha: string;
  nro: string;
  id: string;
  tipo: string;
  numero: string;
  organismo: string;
  tema: string;
  fechaNorma: string;
}): Promise<Row> {
  const { fecha } = n;
  const params = {
    tipo_busqueda: "norma",
    norma_edicto_id: n.id,
    fecha_desde: n.fechaNorma || fecha,
    fecha_hasta: fecha,
    tipo_boletin: "2",
  };
  const html = await post("detail", params);
  await archive(SOURCE, `detalle-${fecha}-${n.id}.html`, html, {
    url: `${BASE}/detail (${new URLSearchParams(params).toString()})`,
  });
  const d = parseDetail(html);
  if (!d.texto) throw new Error("detalle sin texto");
  await mkdir(join(OUT_DIR, "textos", fecha), { recursive: true });
  await writeFile(join(OUT_DIR, "textos", fecha, `${n.id}.txt`), `${d.texto}\n`);

  const sumario = collapseSpaces(d.texto.replace(/^\s*MENDOZA,?[^\n]{0,60}?\d{4}\.?\s*/i, "")).slice(0, 300);
  const expediente = (d.tema || n.tema).match(/EX-\d{4}-\d+-[\w-]+/)?.[0] ?? "";
  return {
    fecha,
    nro_boletin: n.nro,
    norma_id: n.id,
    tipo: n.tipo,
    numero: n.numero,
    organismo: n.organismo,
    expediente,
    sumario,
    largo_texto: d.texto.length,
    url_pdf: d.url_pdf,
    categoria: classify(n.tipo, sumario, d.texto),
    fecha_norma: n.fechaNorma,
    titulo_ley: n.tipo === "ley" ? tituloLey(d.texto) : "",
  };
}

function parseArgs(args: string[]) {
  const today = new Date().toLocaleDateString("sv", { timeZone: "America/Argentina/Mendoza" });
  const val = (k: string) => {
    const i = args.indexOf(k);
    if (i >= 0) return args[i + 1];
    return args.find((a) => a.startsWith(`${k}=`))?.slice(k.length + 1);
  };
  const desde = val("--desde") ?? val("--hasta") ?? today;
  const hasta = val("--hasta") ?? today;
  for (const d of [desde, hasta]) if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`Fecha inválida: ${d}`);
  const soloTipo = (val("--solo-tipo") ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const ids = (val("--ids") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return { desde, hasta, soloTipo, ids };
}

function* dias(desde: string, hasta: string) {
  for (let t = Date.parse(desde); t <= Date.parse(hasta); t += 86_400_000) yield new Date(t).toISOString().slice(0, 10);
}

export async function run(args: string[]) {
  const { desde, hasta, soloTipo, ids } = parseArgs(args);
  const csvPath = join(OUT_DIR, "normas.csv");
  const existing = new Map<string, Row>();
  if (existsSync(csvPath)) for (const r of parseCsv(await readFile(csvPath, "utf8"))) existing.set(String(r.norma_id), r);
  const before = existing.size;
  // Completa titulo_ley de las leyes ya descargadas (sin red).
  for (const r of existing.values()) {
    if (r.tipo !== "ley" || r.titulo_ley) continue;
    const p = join(OUT_DIR, "textos", String(r.fecha), `${r.norma_id}.txt`);
    if (existsSync(p)) r.titulo_ley = tituloLey(await readFile(p, "utf8"));
  }
  if (args.includes("--reclasificar")) {
    // Recalcula la categoría de lo ya descargado, sin tocar la red.
    for (const r of existing.values()) {
      const p = join(OUT_DIR, "textos", String(r.fecha), `${r.norma_id}.txt`);
      if (existsSync(p)) r.categoria = classify(String(r.tipo), String(r.sumario), await readFile(p, "utf8"));
    }
    await writeProcessed(SOURCE, "normas.csv", [...existing.values()], COLUMNS);
    console.log(`Reclasificadas ${existing.size} normas`);
    return;
  }

  if (ids.length) {
    // Completa normas que ya están en el índice: el sumario del índice (el «tema») se usa como respaldo del expediente.
    let ok = 0;
    for (const id of ids) {
      const r = existing.get(id);
      if (!r) {
        console.warn(`  ${id}: no está en normas.csv; primero hay que bajar el índice de su edición`);
        continue;
      }
      if (existsSync(join(OUT_DIR, "textos", String(r.fecha), `${id}.txt`))) continue;
      try {
        existing.set(
          id,
          await fetchDetail({
            fecha: String(r.fecha),
            nro: String(r.nro_boletin),
            id,
            tipo: String(r.tipo),
            numero: String(r.numero),
            organismo: String(r.organismo),
            tema: String(r.sumario),
            fechaNorma: String(r.fecha_norma),
          }),
        );
        ok++;
      } catch (err) {
        console.warn(`  fallo ${r.fecha} norma ${id}: ${(err as Error).message}`);
      }
    }
    const rows = [...existing.values()].sort(
      (a, b) => String(a.fecha).localeCompare(String(b.fecha)) || Number(a.norma_id) - Number(b.norma_id),
    );
    await writeProcessed(SOURCE, "normas.csv", rows, COLUMNS);
    console.log(`Listo: ${ok} de ${ids.length} detalles bajados`);
    return;
  }

  const failed: string[] = [];
  let ediciones = 0,
    edictos = 0,
    detalles = 0;
  const flush = async () => {
    const rows = [...existing.values()].sort(
      (a, b) => String(a.fecha).localeCompare(String(b.fecha)) || Number(a.norma_id) - Number(b.norma_id),
    );
    await writeProcessed(SOURCE, "normas.csv", rows, COLUMNS);
  };

  for (const fecha of dias(desde, hasta)) {
    const found = await post("find", { fecha });
    const nro = found.match(/data-boe-nro="(\d+)"/)?.[1];
    if (!nro) {
      console.log(`${fecha}: sin edición`);
      continue;
    }
    ediciones++;

    const indexHtml = await post("index", { fecha, numero: nro });
    await archive(SOURCE, `index-${fecha}-${nro}.html`, indexHtml, { url: `${BASE}/index (fecha=${fecha}&numero=${nro})` });
    const items = parseIndex(indexHtml, false);

    const supHtml = await post("supplement/index", { fecha, numero: nro });
    if (/supplement-detail/.test(supHtml)) {
      await archive(SOURCE, `suplemento-index-${fecha}-${nro}.html`, supHtml, {
        url: `${BASE}/supplement/index (fecha=${fecha}&numero=${nro})`,
      });
      const known = new Set(items.map((i) => i.id));
      for (const s of parseIndex(supHtml, true)) if (!known.has(s.id)) items.push(s);
    }

    const normas = items.filter((i) => i.kind === "norma");
    edictos += items.length - normas.length;
    let nuevas = 0;

    for (const n of normas) {
      if (soloTipo.length && !soloTipo.includes(n.tipo)) {
        // Fuera del filtro: queda el dato del índice, sin texto (un fila existente no se toca).
        if (!existing.has(n.id)) {
          nuevas++;
          existing.set(n.id, {
            fecha,
            nro_boletin: nro,
            norma_id: n.id,
            tipo: n.tipo,
            numero: n.numero,
            organismo: n.organismo,
            expediente: n.tema.match(/EX-\d{4}-\d+-[\w-]+/)?.[0] ?? "",
            sumario: n.tema.slice(0, 300),
            largo_texto: "",
            url_pdf: "",
            categoria: "",
            fecha_norma: n.fechaNorma,
            titulo_ley: "",
          });
        }
        continue;
      }
      const txtPath = join(OUT_DIR, "textos", fecha, `${n.id}.txt`);
      if (existing.has(n.id) && existsSync(txtPath)) continue;
      try {
        const row = await fetchDetail({ fecha, nro, ...n });
        detalles++;
        if (!existing.has(n.id)) nuevas++;
        existing.set(n.id, row);
      } catch (err) {
        failed.push(`${fecha}/${n.id}`);
        console.warn(`  fallo ${fecha} norma ${n.id}: ${(err as Error).message}`);
      }
    }
    await flush();
    await sleep(1_500); // pausa extra entre ediciones: con el ritmo mínimo el gateway empieza a responder 429
    console.log(`${fecha} BO ${nro}: ${normas.length} normas (${nuevas} nuevas), ${items.length - normas.length} edictos`);
  }

  await flush();
  console.log(
    `Listo: ${ediciones} ediciones, ${detalles} detalles bajados, ${edictos} edictos (solo índice), ` +
      `normas.csv ${before} -> ${existing.size} filas, ${failed.length} fallos${failed.length ? `: ${failed.join(", ")}` : ""}`,
  );
}
