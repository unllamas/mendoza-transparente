/** Readers of each municipality's trade-fee table, by norma_id. Add a line when a new reader is ready. */

import { reader as capital } from "./capital.ts";
import { reader as generalAlvear } from "./general-alvear.ts";
import { reader as godoyCruz } from "./godoy-cruz.ts";
import { reader as guaymallen } from "./guaymallen.ts";
import { reader as lasHeras } from "./las-heras.ts";
import { reader as rivadavia } from "./rivadavia.ts";
import type { Reader } from "./types.ts";

export const READERS: Reader[] = [godoyCruz, capital, lasHeras, guaymallen, generalAlvear, rivadavia];
