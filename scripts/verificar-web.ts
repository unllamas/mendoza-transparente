/**
 * Verificación de la web antes de dar algo por terminado. Levanta el servidor de desarrollo y,
 * con un Chrome sin extensiones, recorre todas las páginas y controla:
 *   1. Que no haya scroll horizontal en 320, 360, 375 y 390 px (celulares) ni en 1024 y 1280 px.
 *   2. Que no haya errores ni advertencias en la consola (incluye los avisos de React, que solo
 *      aparecen en desarrollo), también al abrir hojas de detalle.
 *
 * Uso: bun run verificar     (CHROME_PATH para otro navegador; por defecto, Google Chrome de macOS)
 * Documentado en docs/procesos/web.md.
 */

import { join } from "node:path";
import { chromium } from "playwright-core";

const WEB = join(import.meta.dir, "..", "apps", "web");
const PUERTO = 5199;
const BASE = `http://localhost:${PUERTO}`;
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const RUTAS = [
  "/",
  "/senales",
  "/funcionarios",
  "/deuda",
  "/coparticipacion",
  "/empleo-publico",
  "/poblacion",
  "/no-publicado",
  "/fuentes",
  "/datos/compras-ocds",
  "/datos/boletin-oficial",
  "/datos/indices",
  "/datos/dnap-ron",
];
const ANCHOS = [320, 360, 375, 390, 1024, 1280];

await Bun.spawn(["bun", "run", "data"], { cwd: WEB, stdout: "ignore" }).exited;
const servidor = Bun.spawn(["bunx", "vite", "--port", String(PUERTO), "--strictPort"], { cwd: WEB, stdout: "ignore", stderr: "ignore" });
for (let i = 0; i < 60; i++) {
  if (await fetch(BASE).then((r) => r.ok, () => false)) break;
  await Bun.sleep(500);
}

const problemas: string[] = [];
const browser = await chromium.launch({ executablePath: CHROME });
try {
  // 1. Desbordes horizontales
  for (const ancho of ANCHOS) {
    const page = await browser.newPage({ viewport: { width: ancho, height: 800 }, isMobile: ancho < 700, hasTouch: ancho < 700 });
    for (const ruta of RUTAS) {
      await page.goto(BASE + ruta, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      const { vw, sw } = await page.evaluate(() => ({ vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth }));
      if (sw > vw) problemas.push(`Scroll horizontal en ${ruta} a ${ancho} px (${sw} > ${vw})`);
    }
    await page.close();
  }

  // 2. Consola, con interacciones
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problemas.push(`Consola (${m.type()}) en ${new URL(page.url()).pathname}: ${m.text().slice(0, 160)}`);
  });
  page.on("pageerror", (e) => problemas.push(`Error de página en ${new URL(page.url()).pathname}: ${e.message.slice(0, 160)}`));
  for (const ruta of RUTAS) {
    await page.goto(BASE + ruta, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
  }
  await page.goto(BASE + "/senales", { waitUntil: "networkidle" });
  for (const boton of await page.locator("main ul button").all()) {
    await boton.click();
    await page.waitForTimeout(400);
    const caso = page.locator("aside li button").first();
    if (await caso.count()) {
      await caso.click();
      await page.waitForTimeout(800);
    }
    await page.keyboard.press("Escape");
  }
  await page.goto(BASE + "/funcionarios", { waitUntil: "networkidle" });
  for (const radio of await page.getByRole("radio").all()) await radio.click();
  await page.goto(BASE + "/datos/compras-ocds", { waitUntil: "networkidle" });
  await page.locator("tbody tr").first().click();
  await page.waitForTimeout(1000);
} finally {
  await browser.close();
  servidor.kill();
}

if (problemas.length) {
  console.error(`✗ ${problemas.length} problemas:\n${problemas.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`✓ Sin scroll horizontal (${RUTAS.length} páginas × ${ANCHOS.length} anchos) y consola limpia.`);
