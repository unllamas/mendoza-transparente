/**
 * Graba una escena a MP4, cuadro por cuadro, con el reloj virtual del kit: cada cuadro sale nítido,
 * sin saltos ni cuadros perdidos, aunque la máquina esté ocupada. Levanta el estudio solo.
 *
 *   bun run pieza:grabar <escena> [segundos=16] [--fps 30]
 *
 * Deja tmp/piezas/<escena>.mp4 (1080 × 1350 para una escena de 540 × 675, a 2x) y tmp/piezas/<escena>.png,
 * el cuadro del medio de la vuelta, como imagen fija. Necesita Google Chrome y ffmpeg instalados.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const fps = Number(flag("fps") ?? 30);
const [scene, secondsArg] = args;
if (!scene) {
  console.error("Uso: bun run pieza:grabar <escena> [segundos] [--fps 30]");
  process.exit(1);
}
const seconds = Number(secondsArg ?? 16);

const appDir = resolve(import.meta.dir, "..");
const outDir = resolve(appDir, "../../tmp/piezas");
const framesDir = join(outDir, `${scene}-cuadros`);
rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

const server = await createServer({ root: appDir, configFile: join(appDir, "vite.config.ts"), server: { port: 0 }, logLevel: "error" });
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("No se pudo levantar el estudio");

const browser = await chromium.launch({ channel: "chrome" });
try {
  // La página mide lo mismo que la escena, a 2x: el video sale al doble del tamaño de diseño
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  await page.goto(`${url}?record=${scene}`);
  const stage = await page.waitForSelector(".ss-stage");
  const size = await stage.evaluate((el) => {
    const { width, height } = el.getBoundingClientRect();
    return { width: Math.round(width), height: Math.round(height) };
  });
  await page.setViewportSize(size);
  await page.waitForFunction(() => "__stageshow" in window);
  await page.evaluate(() => document.fonts.ready);

  const total = Math.round(seconds * fps);
  for (let i = 0; i < total; i++) {
    // biome-ignore lint/suspicious/noExplicitAny: el reloj lo instala el kit en window, sin tipos globales
    await page.evaluate(() => (window as any).__stageshow.clock.step(1));
    await page.screenshot({ path: join(framesDir, `${String(i).padStart(5, "0")}.png`), clip: { x: 0, y: 0, ...size } });
    if (i % fps === 0) process.stdout.write(`\r${Math.round(i / fps)} / ${seconds} s`);
  }
  process.stdout.write("\n");

  const video = join(outDir, `${scene}.mp4`);
  execFileSync("ffmpeg", [
    ...["-y", "-loglevel", "error", "-framerate", String(fps), "-i", join(framesDir, "%05d.png")],
    ...["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-preset", "slow", "-movflags", "+faststart", video],
  ]);
  execFileSync("cp", [join(framesDir, `${String(Math.floor(total * 0.62)).padStart(5, "0")}.png`), join(outDir, `${scene}.png`)]);
  rmSync(framesDir, { recursive: true, force: true });
  console.log(`Listo: ${video} (${total} cuadros)`);
} finally {
  await browser.close();
  await server.close();
}
