/**
 * Capturas para revisar una vista previa de interfaz (docs/procesos/vista-previa.md).
 * Por cada ancho: la primera pantalla, la página en cortes de 1400 px (o solo un elemento) y un resumen
 * con scroll horizontal, alto, dónde empieza cada sección (en pantallas) y errores de consola.
 *
 * Uso: bun run vista-previa <ruta> [--compare <ruta>] [--selector <css>] [--widths 320,375,1280] [--dark] [--out <carpeta>]
 *   bun run vista-previa /vista-previa/portada --compare /
 *   bun run vista-previa /vista-previa/portada --selector "section:has(#numeros)" --widths 320,375,1280
 *
 * Usa el servidor de desarrollo en MT_PREVIEW_PORT (5179 por defecto). Si no está levantado, lo levanta y
 * lo cierra al terminar: para iterar rápido conviene dejarlo corriendo (`cd apps/web && bunx vite --port 5179`).
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Page } from "playwright-core";

const WEB = join(import.meta.dir, "..", "apps", "web");
const PORT = Number(process.env.MT_PREVIEW_PORT ?? 5179);
const BASE = `http://localhost:${PORT}`;
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SLICE = 1400;

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    compare: { type: "string" },
    selector: { type: "string" },
    widths: { type: "string", default: "375,1280" },
    dark: { type: "boolean", default: false },
    out: { type: "string" },
  },
});
const [path] = positionals;
if (!path) {
  console.error("Falta la ruta. Ejemplo: bun run vista-previa /vista-previa/portada --compare /");
  process.exit(1);
}
const widths = values.widths.split(",").map(Number);
const out = values.out ?? join("/tmp", "mt-vista-previa", path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "inicio");
await mkdir(out, { recursive: true });

const isUp = () =>
  fetch(BASE).then(
    (r) => r.ok,
    () => false,
  );
let server: ReturnType<typeof Bun.spawn> | undefined;
if (!(await isUp())) {
  await Bun.spawn(["bun", "run", "data"], { cwd: WEB, stdout: "ignore" }).exited;
  server = Bun.spawn(["bunx", "vite", "--port", String(PORT), "--strictPort"], { cwd: WEB, stdout: "ignore", stderr: "ignore" });
  for (let i = 0; i < 60 && !(await isUp()); i++) await Bun.sleep(500);
}

/** Scroll the whole page once, so count-ups and lazy parts have run before the capture. */
async function settle(page: Page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 600) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(50);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
}

async function capture(route: string, prefix: string) {
  const browser = await chromium.launch({ executablePath: CHROME });
  const results = [];
  for (const width of widths) {
    const page = await browser.newPage({
      viewport: { width, height: width < 768 ? 812 : 900 },
      colorScheme: values.dark ? "dark" : "light",
    });
    const consoleIssues: string[] = [];
    page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && consoleIssues.push(m.text()));
    page.on("pageerror", (e) => consoleIssues.push(e.message));
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    if (values.dark) await page.evaluate(() => document.documentElement.classList.add("dark"));
    await settle(page);
    const files: string[] = [];
    const file = (name: string) => {
      const f = join(out, `${prefix}-${width}-${name}.png`);
      files.push(f);
      return f;
    };
    const summary = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      height: document.documentElement.scrollHeight,
      sections: [...document.querySelectorAll("main h2")].map((h) => {
        const top = h.getBoundingClientRect().top + window.scrollY;
        return `${(h.textContent ?? "").trim().slice(0, 40)}: pantalla ${(top / window.innerHeight).toFixed(1)}`;
      }),
    }));
    if (values.selector) {
      const element = page.locator(values.selector).first();
      await element.scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await element.screenshot({ path: file("elemento") });
    } else {
      await page.screenshot({ path: file("pantalla") });
      for (let i = 0, y = 0; y < summary.height; i++, y += SLICE) {
        const clip = { x: 0, y, width, height: Math.min(SLICE, summary.height - y) };
        await page.screenshot({ path: file(`corte${i}`), fullPage: true, clip });
      }
    }
    results.push({ route, width, ...summary, consoleIssues, files });
    await page.close();
  }
  await browser.close();
  return results;
}

try {
  const results = [
    ...(values.compare ? await capture(values.compare, "antes") : []),
    ...(await capture(path, values.compare ? "despues" : "vista")),
  ];
  console.log(JSON.stringify(results, null, 1));
} finally {
  server?.kill();
}
