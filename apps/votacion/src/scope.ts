import type { ElectionSummary } from "./types.ts";

/**
 * Two kinds of vote that the sources mix in one election day. Provincial offices put the same lists in front of the
 * whole province; municipal ones are a separate election in each municipality, with its own lists and numbers. A
 * general election can carry both, so the split goes by office, not by election.
 */
export type Scope = "provincial" | "municipal";

const MUNICIPAL_OFFICES = new Set(["intendente", "concejales", "convencionales"]);

export const scopeOf = (office: string): Scope => (MUNICIPAL_OFFICES.has(office) ? "municipal" : "provincial");

export const officesIn = (offices: string[], scope: Scope) => offices.filter((o) => scopeOf(o) === scope);

/** Elections of a year with at least one office of that scope, in date order. */
export const electionsIn = (elections: ElectionSummary[], scope: Scope) => elections.filter((e) => officesIn(e.cargos, scope).length > 0);

export const SCOPE_LABEL: Record<Scope, string> = { provincial: "Provinciales", municipal: "Municipales" };
