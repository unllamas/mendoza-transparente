/**
 * Actualización manual de datos desde una computadora en Argentina: respaldo de la actualización
 * automática en GitHub Actions, sobre todo para los sitios que rechazan a los servidores en la nube
 * (Boletín Oficial y Senado de Mendoza).
 *
 * Uso (desde la raíz del repo):
 *   bun run actualizar                     fuentes bloqueadas en la nube (Boletín Oficial y Legislatura)
 *   bun run actualizar compras-ocds dnap   fuentes puntuales
 *   bun run actualizar --todas             todas las que corre el workflow
 *   bun run actualizar --si                publica sin preguntar
 *   bun run actualizar --sin-publicar      solo descarga y muestra el resumen
 *
 * Pasos: corre cada scraper, muestra qué cambió, comprueba que la web compile con los datos nuevos,
 * pide confirmación y hace commit y push solo de data/ (nunca de código que se esté editando).
 * Documentado en docs/procesos/actualizacion-de-datos.md.
 */

import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

// Mismas fuentes y argumentos que .github/workflows/actualizar-datos.yml.
const BLOQUEADAS = ["boletin-oficial", "legislatura"];
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
  "proveedores",
  "lrf-personal",
  "presupuesto-planta",
  "designaciones",
  "municipios-personal",
  "municipios-lrf",
  "universidades-estadisticas",
];

const hace = (dias: number) => new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10);
const ARGS: Record<string, string[]> = {
  "boletin-oficial": ["--desde", hace(7), "--hasta", hace(0)],
  dnap: ["--refresh"],
  "etica-publica": ["--refresh"],
};

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const pedidas = args.filter((a) => !a.startsWith("--"));
const fuentes = flags.has("--todas") ? TODAS : pedidas.length ? pedidas : BLOQUEADAS;

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

console.log("\nResumen");
console.table(resultados.map((r) => ({ fuente: r.fuente, estado: r.ok ? "ok" : "falló", archivos: r.archivos, segundos: r.segundos })));

const cambios = await cambiosEnData();
if (cambios.length === 0) {
  console.log("No hay datos nuevos. Nada para publicar.");
  process.exit(resultados.every((r) => r.ok) ? 0 : 1);
}
console.log(`${cambios.length} archivos con cambios en data/.`);

if (flags.has("--sin-publicar")) process.exit(0);

console.log("\nComprobando que la web compile con los datos nuevos…");
const web = join(ROOT, "apps", "web");
const build = (await sh(["bun", "run", "data"], web)).ok && (await sh(["bunx", "tsc", "--noEmit"], web)).ok;
if (!build) {
  console.error("La web no compila con estos datos: no se publica. Revisá el error de arriba.");
  process.exit(1);
}
console.log("La web compila.");

// Data is published straight to main (docs/procesos/ramas-y-releases.md); the back merge carries it to dev.
const branch = (await sh(["git", "branch", "--show-current"], ROOT, true)).salida.trim();
if (branch !== "main") {
  console.error(
    `Los datos se publican desde main y estás en «${branch}». Los cambios quedan en data/: pasate a main (git switch main) y volvé a correrlo.`,
  );
  process.exit(1);
}

if (!flags.has("--si")) {
  process.stdout.write("\n¿Publicar estos datos (commit y push de data/)? [s/N] ");
  const respuesta = (await new Promise<string>((r) => process.stdin.once("data", (d) => r(String(d))))).trim().toLowerCase();
  if (respuesta !== "s" && respuesta !== "si" && respuesta !== "sí") {
    console.log("No se publicó. Los cambios quedan en data/ para revisar.");
    process.exit(0);
  }
}

const actualizadas = resultados.filter((r) => r.ok && r.archivos > 0).map((r) => r.fuente);
await sh(["git", "add", "--", "data"]);
const commit = await sh([
  "git",
  "commit",
  "-m",
  `chore(data): actualización manual (${actualizadas.join(", ") || fuentes.join(", ")})`,
  "-m",
  hace(0),
  "--",
  "data",
]);
if (!commit.ok) process.exit(1);
const push = (await sh(["git", "pull", "--rebase", "--autostash"])).ok && (await sh(["git", "push"])).ok;
console.log(push ? "Publicado." : "El commit quedó hecho pero el push falló: corré `git push` a mano.");
process.exit(push && resultados.every((r) => r.ok) ? 0 : 1);
