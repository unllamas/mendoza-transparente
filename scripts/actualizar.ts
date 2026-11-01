/**
 * Actualización manual de datos desde una computadora en Argentina. Se corre todos los lunes: es la única
 * forma de actualizar los sitios que rechazan a los servidores en la nube (Boletín Oficial, Senado de
 * Mendoza y Ética Pública), porque no hay proxy. Sirve también para reintentar cualquier otra fuente.
 *
 * Uso (desde la raíz del repo):
 *   bun run actualizar                     fuentes bloqueadas en la nube (Boletín Oficial, Legislatura y Ética Pública)
 *   bun run actualizar compras-ocds dnap   fuentes puntuales
 *   bun run actualizar --todas             todas las que corre el workflow
 *   bun run actualizar --si                publica sin preguntar
 *   bun run actualizar --sin-publicar      solo descarga y muestra el resumen y los cambios contra dev
 *
 * Pasos: corre cada scraper (si corrió el Boletín Oficial, también las designaciones, las misiones
 * oficiales y los resúmenes de las leyes nuevas, igual que el workflow), muestra qué cambió contra dev
 * (filas nuevas, filas que ya no están, archivos borrados), comprueba que la web compile con los datos nuevos, pide confirmación y hace commit y push solo
 * de data/ (nunca de código que se esté editando) en una rama que sale de dev, con un PR a dev. Nunca
 * publica en main: los datos llegan a producción con la próxima publicación de dev.
 * Documentado en docs/procesos/actualizacion-de-datos.md.
 */

import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

// Mismas fuentes y argumentos que .github/workflows/actualizar-datos.yml.
const BLOQUEADAS = ["boletin-oficial", "legislatura", "etica-publica"];
const TODAS = [
  "boletin-oficial",
  "compras-ocds",
  "dnap",
  "etica-publica",
  "indices",
  "deie-ipc",
  "atm-recaudacion",
  "hacienda-deuda-stock",
  "hacienda-participacion-municipal",
  "energia-regalias",
  "poblacion",
  "legislatura",
  "autoridades",
  "junta-electoral",
  "proveedores",
  "lrf-personal",
  "presupuesto-planta",
  "designaciones",
  "misiones-oficiales",
  "municipios-personal",
  "municipios-lrf",
  "universidades-estadisticas",
  "universidades-presupuesto",
];

const hace = (dias: number) => new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10);
const ARGS: Record<string, string[]> = {
  // 10 días, como el workflow: un lunes salteado no deja huecos si se corre antes del siguiente.
  "boletin-oficial": ["--desde", hace(10), "--hasta", hace(0)],
  dnap: ["--refresh"],
  "etica-publica": ["--refresh"],
};

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const pedidas = args.filter((a) => !a.startsWith("--"));
// Fuentes derivadas del Boletín Oficial: leen sus normas (no descargan nada), así que van después.
const DERIVADAS_DEL_BOLETIN = ["designaciones", "misiones-oficiales"];
const elegidas = flags.has("--todas") ? TODAS : pedidas.length ? pedidas : BLOQUEADAS;
const fuentes = elegidas.includes("boletin-oficial")
  ? [...elegidas.filter((f) => !DERIVADAS_DEL_BOLETIN.includes(f)), ...DERIVADAS_DEL_BOLETIN]
  : elegidas;

async function sh(cmd: string[], cwd = ROOT, silencioso = false): Promise<{ ok: boolean; salida: string }> {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const ok = (await proc.exited) === 0;
  if (!silencioso && !ok) process.stderr.write(err.slice(-2000));
  return { ok, salida: out + err };
}

const cambiosEnData = async () => (await sh(["git", "status", "--porcelain", "--", "data"], ROOT, true)).salida.split("\n").filter(Boolean);

console.log(`\nActualización manual: ${fuentes.join(", ")}\n`);
const antes = new Set(await cambiosEnData());
const resultados: { fuente: string; ok: boolean; archivos: number; segundos: number }[] = [];

for (const fuente of fuentes) {
  process.stdout.write(`→ ${fuente} … `);
  const t0 = Date.now();
  const { ok } = await sh(["bun", "run", "scrape", fuente, ...(ARGS[fuente] ?? [])]);
  const archivos = (await cambiosEnData()).filter((l) => !antes.has(l) && l.includes(`/${fuente === "dnap" ? "dnap-" : fuente}`)).length;
  const segundos = Math.round((Date.now() - t0) / 1000);
  resultados.push({ fuente, ok, archivos, segundos });
  console.log(ok ? `listo (${archivos} archivos nuevos o modificados, ${segundos} s)` : `FALLÓ (${segundos} s)`);
}

// Resúmenes en lenguaje simple de las leyes nuevas, como en el workflow. Sin la clave, se publican sin resumen.
if (resultados.some((r) => r.fuente === "boletin-oficial" && r.ok)) {
  if (process.env.ANTHROPIC_API_KEY) {
    process.stdout.write("→ resúmenes de leyes … ");
    const ok =
      (await sh(["bun", "run", "data"], join(ROOT, "apps", "web"))).ok && (await sh(["bun", "apps/web/scripts/resumir-leyes.ts"])).ok;
    console.log(ok ? "listo" : "FALLÓ (las leyes nuevas se publican sin resumen)");
  } else {
    console.log("→ resúmenes de leyes: falta ANTHROPIC_API_KEY, las leyes nuevas se publican sin resumen.");
  }
}

console.log("\nResumen");
console.table(resultados.map((r) => ({ fuente: r.fuente, estado: r.ok ? "ok" : "falló", archivos: r.archivos, segundos: r.segundos })));

const cambios = await cambiosEnData();
if (cambios.length === 0) {
  console.log("No hay datos nuevos. Nada para publicar.");
  process.exit(resultados.every((r) => r.ok) ? 0 : 1);
}
console.log(`${cambios.length} archivos con cambios en data/.`);

// Qué cambia contra dev, la rama a la que va el PR de datos: filas nuevas, filas que desaparecen y archivos borrados.
await sh(["git", "fetch", "-q", "origin", "dev"], ROOT, true);
await sh(["git", "add", "-A", "--", "data"]);
const informe = await sh(["bun", "scripts/data-changes.ts", "--base", "origin/dev", "--out", join(ROOT, "tmp", "cambios-datos.md")]);
console.log(`\n${informe.salida}`);

if (flags.has("--sin-publicar")) {
  await sh(["git", "reset", "-q", "--", "data"]);
  process.exit(0);
}

console.log("\nComprobando que la web compile con los datos nuevos…");
const web = join(ROOT, "apps", "web");
const build = (await sh(["bun", "run", "data"], web)).ok && (await sh(["bunx", "tsc", "--noEmit"], web)).ok;
if (!build) {
  console.error("La web no compila con estos datos: no se publica. Revisá el error de arriba.");
  process.exit(1);
}
console.log("La web compila.");

// Los datos van a dev por un PR, nunca directo a main (docs/procesos/ramas-y-releases.md#datos).
let branch = (await sh(["git", "branch", "--show-current"], ROOT, true)).salida.trim();
if (branch === "main") {
  console.error("Estás en main y los datos no se publican ahí. Pasate a dev (git switch dev && git pull) y volvé a correrlo.");
  process.exit(1);
}
if (branch === "dev") {
  branch = `datos/actualizacion-${hace(0)}`;
  if (!(await sh(["git", "switch", "-c", branch])).ok) process.exit(1);
}

if (!flags.has("--si")) {
  process.stdout.write(`\n¿Commitear estos datos en «${branch}» y abrir un PR a dev? [s/N] `);
  const respuesta = (await new Promise<string>((r) => process.stdin.once("data", (d) => r(String(d))))).trim().toLowerCase();
  if (respuesta !== "s" && respuesta !== "si" && respuesta !== "sí") {
    console.log("No se publicó. Los cambios quedan en data/ para revisar.");
    process.exit(0);
  }
}

const actualizadas = resultados.filter((r) => r.ok && r.archivos > 0).map((r) => r.fuente);
const titulo = `chore(data): actualización manual (${actualizadas.join(", ") || fuentes.join(", ")})`;
const commit = await sh(["git", "commit", "-m", titulo, "-m", hace(0), "--", "data"]);
if (!commit.ok) process.exit(1);
if (!(await sh(["git", "push", "-u", "origin", branch])).ok) {
  console.error("El commit quedó hecho pero el push falló: corré `git push -u origin HEAD` a mano.");
  process.exit(1);
}
const existente = (await sh(["gh", "pr", "view", branch, "--json", "url", "-q", ".url"], ROOT, true)).salida.trim();
const pr = existente.startsWith("https://")
  ? { ok: true, salida: existente }
  : await sh([
      "gh",
      "pr",
      "create",
      "--base",
      "dev",
      "--head",
      branch,
      "--title",
      titulo,
      "--body-file",
      join(ROOT, "tmp", "cambios-datos.md"),
    ]);
console.log(
  pr.ok
    ? `PR a dev: ${pr.salida.trim().split("\n").pop()}`
    : "El push quedó hecho pero no se pudo abrir el PR: abrilo con `gh pr create --base dev`.",
);
process.exit(pr.ok && resultados.every((r) => r.ok) ? 0 : 1);
