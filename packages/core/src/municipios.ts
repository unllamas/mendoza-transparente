/** Los 18 municipios de Mendoza con su nombre oficial. */
export const MUNICIPIOS = [
  "Capital",
  "General Alvear",
  "Godoy Cruz",
  "Guaymallén",
  "Junín",
  "La Paz",
  "Las Heras",
  "Lavalle",
  "Luján de Cuyo",
  "Maipú",
  "Malargüe",
  "Rivadavia",
  "San Carlos",
  "San Martín",
  "San Rafael",
  "Santa Rosa",
  "Tunuyán",
  "Tupungato",
] as const;

export type Municipio = (typeof MUNICIPIOS)[number];

const key = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

const ALIASES: Record<string, Municipio> = {
  ciudad: "Capital",
  ciudaddemendoza: "Capital",
  mendoza: "Capital",
  gralalvear: "General Alvear",
  genalvear: "General Alvear",
  lujan: "Luján de Cuyo",
  gralsanmartin: "San Martín",
  generalsanmartin: "San Martín",
};

const BY_KEY = new Map<string, Municipio>(MUNICIPIOS.map((m) => [key(m), m]));

/** Normaliza un nombre de municipio a su forma oficial, o devuelve null si no lo reconoce. */
export function normalizeMunicipio(name: string): Municipio | null {
  const k = key(name);
  return BY_KEY.get(k) ?? ALIASES[k] ?? null;
}
