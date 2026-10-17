/**
 * Mide LCP, FCP y CLS de las páginas clave sobre el build de producción (apps/web/dist), como un celular con
 * red lenta y como una computadora. Sirve para encontrar qué página o bloque corre el contenido y para comparar
 * antes y después de un cambio. Detalle en docs/procesos/web.md, «Velocidad de carga».
 *
 *   bun run medir                 # build ya hecho (bunx vite build && bun scripts/seo.ts en apps/web)
 *   bun run medir /coparticipacion /leyes/9557
 */
import { join } from "node:path";
import { type Browser, chromium } from "playwright-core";

const WEB = join(import.meta.dir, "..", "apps", "web");
const PORT = Number(process.env.MT_VITALS_PORT ?? 5198);
const BASE = `http://localhost:${PORT}`;
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const temas = join(WEB, "public", "data", "temas");
const firstOf = async <T>(file: string, pick: (rows: T[]) => string | undefined) => pick((await Bun.file(join(temas, file)).json()) as T[]);

const ROUTES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "/",
      "/senales",
      "/coparticipacion",
      "/poblacion",
      "/deuda",
      "/empleo-publico",
      "/municipios",
      "/municipios/san-rafael",
      "/funcionarios",
      "/gobierno",
      "/leyes",
      "/leyes/9557",
      "/proveedores",
      "/no-publicado",
      "/datos/hacienda-deuda-stock",
      await firstOf<{ slug: string; indexable: boolean }>("proveedores.json", (r) => {
        const p = r.find((x) => x.indexable);
        return p && `/proveedores/${p.slug}`;
      }),
      await firstOf<{ slug: string }>("organismos.json", (r) => r[0] && `/organismos/${r[0].slug}`),
    ].filter((r): r is string => Boolean(r));

/** Celular de gama media: CPU 4 veces más lenta y una red «4G lenta» (unos 1,6 Mbps con 150 ms de latencia). */
const PROFILES = {
  celular: { viewport: { width: 375, height: 800 }, isMobile: true, cpu: 4, net: { latency: 150, down: 200_000, up: 90_000 } },
  escritorio: { viewport: { width: 1280, height: 800 }, isMobile: false, cpu: 1, net: null },
} as const;

type Result = { lcp: number; fcp: number; cls: number; shifts: { value: number; nodes: string[] }[]; console?: string[] };

/** Runs in the page before any script: collects LCP, FCP and every layout shift with the nodes that moved. */
const OBSERVE = () => {
  const w = window as unknown as { __vitals: Result };
  w.__vitals = { lcp: 0, fcp: 0, cls: 0, shifts: [] };
  const describe = (n: Node | null) => {
    if (!(n instanceof Element)) return "#text";
    const cls = typeof n.className === "string" ? n.className.split(" ").slice(0, 3).join(".") : "";
    const heading = n.querySelector("h1,h2,h3")?.textContent?.slice(0, 40);
    return `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ""}${cls ? `.${cls}` : ""}${heading ? ` «${heading}»` : ""}`;
  };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) w.__vitals.lcp = e.startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (e.name === "first-contentful-paint") w.__vitals.fcp = e.startTime;
  }).observe({ type: "paint", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean; sources?: { node: Node | null }[] }[]) {
      if (e.hadRecentInput) continue;
      w.__vitals.cls += e.value;
      w.__vitals.shifts.push({ value: e.value, nodes: (e.sources ?? []).map((s) => describe(s.node)) });
    }
  }).observe({ type: "layout-shift", buffered: true });
};

async function measure(browser: Browser, profile: keyof typeof PROFILES, route: string): Promise<Result> {
  const p = PROFILES[profile];
  const context = await browser.newContext({ viewport: p.viewport, isMobile: p.isMobile, hasTouch: p.isMobile });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: p.cpu });
  if (p.net) {
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: p.net.latency,
      downloadThroughput: p.net.down,
      uploadThroughput: p.net.up,
    });
  }
  // Warnings too: a preload the page does not use, or one that fails, only shows up there.
  const consoleIssues: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") consoleIssues.push(`${m.type()}: ${m.text().slice(0, 160)}`);
  });
  await page.addInitScript(OBSERVE);
  await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 120_000 });
  // Chrome reports an unused preload 3 s after the load event.
  await page.waitForTimeout(3500);
  // LCP se cierra con la primera interacción; CLS sigue contando hasta que la página se oculta.
  const result = await page.evaluate(() => (window as unknown as { __vitals: Result }).__vitals);
  await context.close();
  return { ...result, console: consoleIssues };
}

const server = Bun.spawn(["bunx", "vite", "preview", "--port", String(PORT), "--strictPort"], {
  cwd: WEB,
  stdout: "ignore",
  stderr: "ignore",
});
for (let i = 0; i < 60; i++) {
  if (
    await fetch(BASE).then(
      (r) => r.ok,
      () => false,
    )
  )
    break;
  await Bun.sleep(500);
}

const browser = await chromium.launch({ executablePath: CHROME });
const s = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
try {
  for (const profile of Object.keys(PROFILES) as (keyof typeof PROFILES)[]) {
    console.log(`\n== ${profile}`);
    console.log("ruta".padEnd(48), "FCP".padStart(8), "LCP".padStart(8), "CLS".padStart(7));
    for (const route of ROUTES) {
      const r = await measure(browser, profile, route);
      const flag = r.cls > 0.1 ? "  ← CLS" : "";
      console.log(route.padEnd(48), s(r.fcp).padStart(8), s(r.lcp).padStart(8), r.cls.toFixed(3).padStart(7) + flag);
      for (const issue of r.console ?? []) console.log(`    consola ${issue}`);
      for (const shift of r.shifts
        .filter((x) => x.value >= 0.01)
        .sort((a, b) => b.value - a.value)
        .slice(0, 3)) {
        console.log(`    ${shift.value.toFixed(3)}  ${shift.nodes.join(" | ")}`);
      }
    }
  }
} finally {
  await browser.close();
  server.kill();
}
