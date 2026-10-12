/**
 * Resúmenes en lenguaje simple de las leyes que todavía no tienen uno, con la API de Claude.
 * Los agrega a data/curado/leyes.yaml (no pisa los que ya existen ni los editados a mano).
 *
 * Uso (desde la raíz del repo, después de `bun run data` en apps/web):
 *   bun run resumir-leyes            todas las leyes sin resumen
 *   bun run resumir-leyes 9735 9733  leyes puntuales (las rehace aunque ya tengan resumen)
 *
 * Necesita ANTHROPIC_API_KEY. En GitHub Actions corre después de cada actualización del Boletín Oficial
 * si el secreto está cargado; si no, se saltea con un aviso.
 * Criterios y revisión: docs/procesos/metodologia.md#resumenes-de-leyes.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";

import type { LeyDetalle } from "../src/types.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
const CURADO = join(ROOT, "data", "curado", "leyes.yaml");
const LEYES = join(ROOT, "apps", "web", "public", "data", "temas", "leyes");
const MODELO = process.env.MODELO_RESUMENES ?? "claude-sonnet-5-5";

export const TEMAS = [
  "Seguridad y justicia",
  "Salud",
  "Educación",
  "Economía y finanzas",
  "Impuestos",
  "Tierras y expropiaciones",
  "Obras e infraestructura",
  "Ambiente y agua",
  "Energía y minería",
  "Trabajo y empleo público",
  "Convenios y ratificaciones",
  "Municipios",
  "Derechos y sociedad",
  "Producción",
  "Transporte",
  "Otros",
] as const;

export const INSTRUCCIONES = `Resumís leyes de la provincia de Mendoza (Argentina) para ciudadanos que no manejan lenguaje jurídico.

Reglas:
- Usá solo lo que dice el texto. No inventes, no supongas intenciones ni consecuencias que el texto no menciona.
- Neutral: sin adjetivos valorativos ni opiniones ("importante", "polémica", "beneficia"…).
- Español rioplatense claro, oraciones cortas, sin jerga ("ratifícase" → "aprueba"; "sujeto a expropiación" → "el Estado puede expropiar").
- Explicá qué cambia en concreto: quién, qué, dónde, cuánta plata o qué plazo, si el texto lo dice.
- Si la ley aprueba un decreto, convenio o resolución, decí de qué trata ese documento según el texto; si el texto no lo dice, decí que el detalle está en el anexo.
- Nombres de personas: solo si son parte del contenido (no los firmantes).

Devolvé:
- titulo: hasta 70 caracteres, descriptivo, sin "Ley N°" (ej.: "Nuevo régimen penal para adolescentes", "Expropiación de un terreno en Lavalle para un barrio").
- tema: uno de la lista.
- resumen: 2 o 3 oraciones, hasta 400 caracteres.
- puntos: de 2 a 5 puntos concretos, hasta 160 caracteres cada uno.`;

const HERRAMIENTA = {
  name: "resumen_ley",
  description: "Resumen en lenguaje simple de una ley provincial.",
  input_schema: {
    type: "object",
    properties: {
      titulo: { type: "string", maxLength: 80 },
      tema: { type: "string", enum: TEMAS },
      resumen: { type: "string", maxLength: 450 },
      puntos: { type: "array", items: { type: "string", maxLength: 180 }, minItems: 2, maxItems: 5 },
    },
    required: ["titulo", "tema", "resumen", "puntos"],
  },
};

interface Entrada {
  numero: string;
  titulo: string;
  tema: string;
  resumen: string;
  puntos: string[];
  hecho_con: string;
  fecha: string;
  revisado?: string;
}

/** Texto de la ley armado desde su estructura (sin preámbulo ni firmas). */
export function textoParaResumir(ley: LeyDetalle): string {
  const partes = [ley.encabezado ?? ""];
  for (const b of ley.bloques) {
    if (b.tipo === "articulo") partes.push(`Artículo ${b.numero}${b.titulo ? ` (${b.titulo})` : ""}: ${b.parrafos.join("\n")}`);
    else partes.push(b.texto);
  }
  return partes.filter(Boolean).join("\n").slice(0, 80_000);
}

async function resumir(ley: LeyDetalle, apiKey: string): Promise<Omit<Entrada, "numero" | "hecho_con" | "fecha">> {
  for (let intento = 1; ; intento++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 1500,
        system: INSTRUCCIONES,
        tools: [HERRAMIENTA],
        tool_choice: { type: "tool", name: HERRAMIENTA.name },
        messages: [{ role: "user", content: `Ley ${ley.numero} de Mendoza (${ley.fecha ?? "sin fecha"}).\n\n${textoParaResumir(ley)}` }],
      }),
    });
    if (res.ok) {
      const body = (await res.json()) as { content: { type: string; input?: unknown }[] };
      const uso = body.content.find((c) => c.type === "tool_use");
      if (!uso?.input) throw new Error(`Ley ${ley.numero}: la respuesta no trajo el resumen`);
      return uso.input as Omit<Entrada, "numero" | "hecho_con" | "fecha">;
    }
    if ((res.status === 429 || res.status >= 500) && intento < 5) {
      await Bun.sleep(intento * 15_000);
      continue;
    }
    throw new Error(`Ley ${ley.numero}: la API respondió ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
}

if (import.meta.main) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("::warning::Falta ANTHROPIC_API_KEY: las leyes nuevas quedan sin resumen (se muestran con su texto).");
    process.exit(0);
  }
  if (!existsSync(LEYES)) throw new Error("No hay leyes generadas: corré `bun run data` en apps/web primero.");

  const pedidas = process.argv.slice(2);
  const existentes = (existsSync(CURADO) ? ((parse(readFileSync(CURADO, "utf8")) as Entrada[] | null) ?? []) : []).map((e) => ({ ...e, numero: String(e.numero) }));
  const conResumen = new Set(existentes.map((e) => e.numero));
  const numeros = readdirSync(LEYES)
    .map((f) => f.replace(/\.json$/, ""))
    .filter((n) => (pedidas.length ? pedidas.includes(n) : !conResumen.has(n)))
    .sort((a, b) => Number(b) - Number(a));

  if (!numeros.length) {
    console.log("Todas las leyes tienen resumen.");
    process.exit(0);
  }
  const hoy = new Date().toISOString().slice(0, 10);
  const nuevas: Entrada[] = [];
  for (const n of numeros) {
    const ley = JSON.parse(readFileSync(join(LEYES, `${n}.json`), "utf8")) as LeyDetalle;
    if (!ley.bloques.length) {
      console.log(`- Ley ${n}: sin texto, se saltea`);
      continue;
    }
    const r = await resumir(ley, apiKey);
    nuevas.push({ numero: n, titulo: r.titulo, tema: r.tema, resumen: r.resumen, puntos: r.puntos, hecho_con: MODELO, fecha: hoy });
    console.log(`- Ley ${n}: ${r.titulo}`);
  }
  const rehechas = new Set(nuevas.map((e) => e.numero));
  const todas = [...existentes.filter((e) => !rehechas.has(e.numero)), ...nuevas].sort((a, b) => Number(b.numero) - Number(a.numero));
  writeFileSync(
    CURADO,
    `# Resúmenes en lenguaje simple de las leyes, hechos con IA a partir del texto oficial (scripts/resumir-leyes.ts).\n# Se pueden corregir a mano: al revisar uno, agregar "revisado: AAAA-MM-DD". Criterios en docs/procesos/metodologia.md.\n\n${stringify(todas, { lineWidth: 0 })}`,
  );
  console.log(`${nuevas.length} resúmenes nuevos en data/curado/leyes.yaml.`);
}
