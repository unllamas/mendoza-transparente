/**
 * Toques visibles en las piezas. Un toque pasa en tres tiempos: el dedo baja (punto y onda, del kit),
 * lo tocado se marca con `data-touched` durante TAP_HOLD y recién ahí cambia la pantalla. Sin esa pausa,
 * el cambio de pantalla tapa el toque y no se ve qué se tocó.
 */
import type { Act } from "../../vendor/stageshow/kit";

export const TAP_HOLD = 260;

type Touchable = { touched: string | null };

/** Toca un `data-target`, lo marca y espera; quien llama cambia la pantalla y limpia `touched` en el mismo set. */
export async function tap<S extends Touchable>(a: Act<S>, target: string, at = { x: 0.5, y: 0.5 }) {
  await a.click({ at: target, ...at });
  await a.set({ touched: target } as Partial<S>);
  await a.wait(TAP_HOLD);
}
