/** "Eco Clean S.A.S." → "eco-clean-s-a-s". Lo usan el build y la web para las URLs. */
export function slug(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "sin-nombre"
  );
}

/** URL de un proveedor: nombre legible y CUIT al final, que es lo que lo identifica. */
export const slugProveedor = (nombre: string, cuit: string) => `${slug(nombre)}-${cuit}`;
export const cuitDeSlug = (s: string) => /(\d{11})$/.exec(s)?.[1] ?? null;

/** Sección electoral de cada departamento (para «tus legisladores»). */
export const SECCION_ELECTORAL: Record<string, string> = {
  Capital: "Primera",
  Guaymallén: "Primera",
  "Las Heras": "Primera",
  Lavalle: "Primera",
  Maipú: "Segunda",
  "San Martín": "Segunda",
  Junín: "Segunda",
  Rivadavia: "Segunda",
  "Santa Rosa": "Segunda",
  "La Paz": "Segunda",
  "Godoy Cruz": "Tercera",
  "Luján de Cuyo": "Tercera",
  Tunuyán: "Tercera",
  Tupungato: "Tercera",
  "San Carlos": "Tercera",
  "San Rafael": "Cuarta",
  "General Alvear": "Cuarta",
  Malargüe: "Cuarta",
};
