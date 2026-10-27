import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AVATAR_SIZES, avatarFile, MASCOTS, poseFile } from "./manifest.ts";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Where the manifests and the illustrator's originals live. */
export const SOURCE_ROOT = join(PACKAGE_ROOT, "mascots");
/** Where the generated files are served from. */
export const OUTPUT_ROOT = join(PACKAGE_ROOT, "..", "..", "apps", "web", "public", "mascotas");

/** Weight budget (bytes) per generated width: the big ones for the welcome, the small ones for the chat. */
const MAX_BYTES: Record<number, number> = { 96: 20 * 1024, 192: 40 * 1024, 256: 70 * 1024, 512: 150 * 1024 };

/** Every problem found between the manifests, the originals and the generated files. Empty means all good. */
export function checkAssets(): string[] {
  const problems: string[] = [];
  const need = (path: string, label: string, maxBytes?: number) => {
    if (!existsSync(path)) {
      problems.push(`${label}: falta ${path}`);
      return;
    }
    if (maxBytes !== undefined && statSync(path).size > maxBytes) problems.push(`${label}: pesa más de ${maxBytes} bytes`);
  };

  for (const [id, mascot] of Object.entries(MASCOTS)) {
    if (mascot.id !== id) problems.push(`${id}: el manifiesto dice id "${mascot.id}"`);
    if (!(mascot.defaultStyle in mascot.styles)) problems.push(`${id}: defaultStyle "${mascot.defaultStyle}" no es un estilo`);
    for (const [styleId, style] of Object.entries(mascot.styles)) {
      const where = `${id}/${styleId}`;
      if (!(style.avatar.pose in style.poses)) problems.push(`${where}: avatar.pose "${style.avatar.pose}" no es una pose`);
      if (style.avatar.crop.size <= 0) problems.push(`${where}: avatar.crop.size tiene que ser mayor a 0`);
      for (const pose of Object.keys(style.poses)) {
        need(join(SOURCE_ROOT, id, styleId, "originales", `${pose}.webp`), `${where}/${pose} (original)`);
        for (const size of style.sizes) {
          need(join(OUTPUT_ROOT, id, styleId, poseFile(pose, size)), `${where}/${pose}-${size}`, MAX_BYTES[size]);
        }
      }
      for (const size of AVATAR_SIZES) {
        need(join(OUTPUT_ROOT, id, styleId, avatarFile(size)), `${where}/avatar-${size}`, MAX_BYTES[size]);
      }
    }
  }
  return problems;
}
