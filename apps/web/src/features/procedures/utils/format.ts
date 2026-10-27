import { formatNumber } from "@/lib.ts";
import type { NotPublished, OnlineStatus, ProcedureFee } from "@/types.ts";

export const PROCEDURE = "abrir-un-comercio";

/** Whole pesos with the thousands dots ("$ 1.753.906"): a fee is read to the peso, not rounded to millions. */
export const pesos = (v: number) => `$ ${formatNumber(Math.round(v))}`;

/** "por bimestre", or an empty string when the ordinance does not say how often the fee is paid. */
export const periodLabel = (period: string) => (period ? `por ${period}` : "");

/** What the ordinance says about how often the fee is paid, in a sentence. */
export const periodSentence = (period: string) =>
  period
    ? `El monto es ${period === "año" ? "anual" : period === "mes" ? "mensual" : "bimestral"}.`
    : "La ordenanza no aclara si el monto es mensual o anual.";

export const ONLINE_LABEL: Record<OnlineStatus, string> = {
  online: "Se puede iniciar en línea",
  in_person: "Se inicia en persona",
  unknown: "La ficha no dice cómo se inicia",
  not_published: "No publica si se hace en línea",
};

export const WHEN_LABEL: Record<string, string> = {
  alimentos: "Solo si vendés o preparás alimentos",
};

/** "<organismo> no publica <lo que falta>", as the site says it everywhere. */
export function notPublishedSentence(n: NotPublished): string {
  const agency = n.agency === "ATM" ? "La ATM" : n.agency;
  return `${agency} no publica ${n.what.charAt(0).toLowerCase()}${n.what.slice(1)}.`;
}

/** The amounts of a municipality that gives them in tax units ("UTM"), in pesos with the unit's value. */
export function inPesos(amount: number, fee: Pick<ProcedureFee, "unit" | "unitValue">): number {
  return fee.unit === "pesos" ? amount : amount * (fee.unitValue ?? 1);
}

/** "500 a 2.000 UT" or "$ 8.996 a $ 14.938", the way the municipality gives the range. */
export function rangeLabel(min: number, max: number, unit: string): string {
  return unit === "pesos" ? `${pesos(min)} a ${pesos(max)}` : `${formatNumber(min)} a ${formatNumber(max)} ${unit}`;
}
