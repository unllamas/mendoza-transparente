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

/** Cargos con página propia: /funcionarios/<slug> y /funcionarios/<slug>/<nombre>. */
export const ROLES = {
  ejecutivo: {
    slug: "gobierno",
    title: "Gobierno de Mendoza",
    description: "Gobernador, vicegobernadora, ministros y autoridades del Poder Ejecutivo provincial.",
  },
  intendentes: {
    slug: "intendentes",
    title: "Intendentes de Mendoza",
    description: "Quién gobierna cada uno de los 18 municipios de Mendoza, su partido y hasta cuándo dura su mandato.",
  },
  diputados_provincial: {
    slug: "diputados-provinciales",
    title: "Diputados provinciales de Mendoza",
    description: "Los 48 diputados de la Legislatura de Mendoza: bloque, sección electoral, mandato y declaración jurada.",
  },
  senado_provincial: {
    slug: "senadores-provinciales",
    title: "Senadores provinciales de Mendoza",
    description: "Los senadores de la Legislatura de Mendoza: bloque, sección electoral, mandato y declaración jurada.",
  },
  diputados_nacional: {
    slug: "diputados-nacionales",
    title: "Diputados nacionales por Mendoza",
    description: "Quiénes representan a Mendoza en la Cámara de Diputados de la Nación, su bloque y mandato.",
  },
  senado_nacional: {
    slug: "senadores-nacionales",
    title: "Senadores nacionales por Mendoza",
    description: "Los tres senadores que representan a Mendoza en el Senado de la Nación, su bloque y mandato.",
  },
} as const satisfies Record<string, { slug: string; title: string; description: string }>;

export type RoleKey = keyof typeof ROLES;
export const roleBySlug = (s: string) =>
  (Object.entries(ROLES) as [RoleKey, (typeof ROLES)[RoleKey]][]).find(([, r]) => r.slug === s)?.[0] ?? null;

/** Sections → municipalities, for linking provincial legislators to the places they represent. */
export const municipalitiesInSection = (section: string) =>
  Object.entries(SECCION_ELECTORAL)
    .filter(([, s]) => section.startsWith(s))
    .map(([m]) => m);
