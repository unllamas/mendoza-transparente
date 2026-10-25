import { describe, expect, test } from "bun:test";

import type { SearchEntry } from "@/types.ts";
import { fold, match, withinOneEdit } from "./search-match.ts";

const e = (k: string, t: string, s = "", q?: string): SearchEntry => ({ p: `/${k}/${t}`, k, t, s, q });
const index: SearchEntry[] = [
  e("Funcionario", "Ulpiano Leandro Suárez", "Intendente de la Ciudad de Mendoza"),
  e("Funcionario", "Federico Palazzo Latuf", "Subsecretario"),
  e("Funcionario", "Federico Gómez", "Director"),
  e("Ex funcionario", "Samuel Federico Barcudi Abbona", "Ex director"),
  e("Ex funcionario", "María José Sanz", "Ex diputada"),
  e("Área que compra", "Dirección General de Compras y Suministros", "Compras"),
  e("Organismo", "Hospital Central", "Salud"),
  e("Organismo", "Hospital Schestakow", "Salud"),
  e("Proveedor", "ECO CLEAN S.A.S.", "Limpieza", "30-71234567-8"),
  e("Ley", "Ley 9.735", "Presupuesto"),
  e("Proveedor", "Suárez Hermanos SRL", "Ferretería"),
];
const titles = (q: string) => match(index, q).map((x) => x.t);

describe("match", () => {
  test("surname only, people before companies", () => {
    expect(titles("suarez")).toEqual(["Ulpiano Leandro Suárez", "Suárez Hermanos SRL"]);
    expect(titles("Sanz")).toEqual(["María José Sanz"]);
  });
  test("prefix of a word", () => {
    expect(titles("sumini")).toEqual(["Dirección General de Compras y Suministros"]);
  });
  test("accents on either side", () => {
    expect(titles("Suárez")).toEqual(titles("suarez"));
    expect(titles("Maria Jose")).toEqual(["María José Sanz"]);
  });
  test("partial last word", () => {
    expect(titles("federico g")).toEqual(["Federico Gómez"]);
    expect(titles("hospital s")).toEqual(["Hospital Schestakow"]);
  });
  test("any word order", () => {
    expect(titles("Suarez Ulpiano")).toEqual(["Ulpiano Leandro Suárez"]);
    expect(titles("Ulpiano Suarez")).toEqual(["Ulpiano Leandro Suárez"]);
  });
  test("one typo in words of 5 letters or more", () => {
    expect(titles("Ulpiano Suares")).toEqual(["Ulpiano Leandro Suárez"]);
    expect(titles("ulpyano")).toEqual(["Ulpiano Leandro Suárez"]);
    expect(titles("ulpaino")).toEqual(["Ulpiano Leandro Suárez"]);
  });
  test("no typo tolerance in short words, and none for two typos", () => {
    expect(titles("sanx")).toEqual([]);
    expect(titles("ulpyanu")).toEqual([]);
  });
  test("exact matches go before typo matches", () => {
    const mixed = match([e("Funcionario", "Roberto Suarex"), e("Proveedor", "Suarez SA")], "suarez");
    expect(mixed.map((x) => x.t)).toEqual(["Suarez SA", "Roberto Suarex"]);
  });
  test("people go first when the query looks like a name", () => {
    const r = match([e("Proveedor", "Federico SA"), e("Funcionario", "Ana Federico")], "federico");
    expect(r[0]!.k).toBe("Funcionario");
  });
  test("no match", () => {
    expect(titles("Pietrelli")).toEqual([]);
    expect(match(index, "   ")).toEqual([]);
  });
  test("laws and company names, with or without dots and spaces", () => {
    expect(titles("ley 9735")).toEqual(["Ley 9.735"]);
    expect(titles("ecoclean")).toEqual(["ECO CLEAN S.A.S."]);
    expect(titles("30-71234567-8")).toEqual(["ECO CLEAN S.A.S."]);
  });
});

describe("helpers", () => {
  test("fold", () => expect(fold("Suárez 9.735")).toBe("suarez 9735"));
  test("withinOneEdit", () => {
    expect(withinOneEdit("suarez", "suares")).toBe(true);
    expect(withinOneEdit("suarez", "suare")).toBe(true);
    expect(withinOneEdit("suarez", "suarzes")).toBe(false);
    expect(withinOneEdit("abc", "abcde")).toBe(false);
  });
});
