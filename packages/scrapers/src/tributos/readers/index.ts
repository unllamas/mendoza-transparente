/** Readers of each municipality's trade-fee table, by norma_id. Add a line when a new reader is ready. */

import { reader as godoyCruz } from "./godoy-cruz.ts";
import type { Reader } from "./types.ts";

export const READERS: Reader[] = [godoyCruz];
