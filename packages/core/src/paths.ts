import { join } from "node:path";

/** Raíz del monorepo. */
export const ROOT = join(import.meta.dir, "..", "..", "..");
export const RAW_DIR = join(ROOT, "data", "raw");
export const PROCESSED_DIR = join(ROOT, "data", "processed");
