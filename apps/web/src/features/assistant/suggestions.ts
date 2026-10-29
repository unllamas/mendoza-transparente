import { MUNICIPALITIES } from "@mt/assistant/types";
import { slug } from "@/slug.ts";

/**
 * Las sugerencias de la bienvenida de Aco según la página donde se abrió. Reglas:
 * - Exactamente tres, de a una línea a 320 px (máximo 32 caracteres), en voz de la persona.
 * - Solo preguntas que Aco responde con sus herramientas (`find_site_page`, `search_purchases`, `search_people`,
 *   `get_municipality`, `search_laws`, `search_unpublished`, trámites y tasas). Una sugerencia que termina en «no sé»
 *   es peor que ninguna: si se suma una, se prueba en el asistente antes.
 * - Para sumar una página, agregar una regla a `RULES`; las más visitadas van primero.
 */

/** Las de siempre: un trámite, una tasa y los datos del sitio. */
const DEFAULT: string[] = ["¿Cómo abro un comercio?", "¿Cuánto cobra mi municipio?", "¿Quién le vende al Estado?"];

/** Municipio de la URL (`/municipios/godoy-cruz`) con el nombre que se dice en voz alta, o null si no es uno de los 18. */
function municipalityName(pathname: string): string | null {
  const key = /^\/municipios\/([^/]+)/.exec(pathname)?.[1];
  const name = MUNICIPALITIES.find((m) => slug(m) === key);
  if (!name) return null;
  return name === "Capital" ? "la Capital" : name;
}

const SALARIES = "¿Cuánto cobra el gobernador?";
const REQUEST = "¿Cómo pido información?";
const UNPUBLISHED = "¿Qué datos no se publican?";
const DEBT = "¿Cuánto debe la Provincia?";
const TOP_SUPPLIERS = "¿Quién le vende más al Estado?";

interface Rule {
  test: (pathname: string) => boolean;
  questions: (pathname: string) => string[];
}

const startsWith = (prefix: string) => (pathname: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

const RULES: Rule[] = [
  { test: (p) => p === "/", questions: () => [TOP_SUPPLIERS, DEBT, "¿Cómo abro un comercio?"] },
  {
    test: startsWith("/coparticipacion"),
    questions: () => ["¿Cuánto reparte la Provincia?", "¿Cuánto le toca a Maipú?", "¿Cuánta gente vive en Mendoza?"],
  },
  // La ficha de un proveedor no trae el nombre en la URL (lleva el CUIT): las mismas que la lista.
  { test: startsWith("/proveedores"), questions: () => [TOP_SUPPLIERS, "¿Qué compró el Hospital Central?", "¿Qué son las señales?"] },
  { test: startsWith("/organismos"), questions: () => ["¿Qué compró el Hospital Central?", TOP_SUPPLIERS, "¿Qué son las señales?"] },
  // Trámites y tasas de un municipio: lo que se está mirando es el trámite, no la ficha.
  {
    test: (p) => p.startsWith("/tramites") || /^\/municipios\/[^/]+\/(tramites|tasas)/.test(p),
    questions: () => ["¿Cómo abro un comercio?", "¿Cuánto cobra mi municipio?", UNPUBLISHED],
  },
  {
    test: (p) => municipalityName(p) !== null,
    questions: (p) => {
      const name = municipalityName(p);
      return [`¿Quién gobierna ${name}?`, `¿Qué publica ${name}?`, `¿Cuánto recibe ${name}?`];
    },
  },
  {
    test: startsWith("/municipios"),
    questions: () => ["¿Quién gobierna Maipú?", "¿Cuánto cobra mi municipio?", "¿Cómo abro un comercio?"],
  },
  { test: startsWith("/gobierno"), questions: () => ["¿Quién es el gobernador?", "¿Cuánta gente trabaja en Salud?", SALARIES] },
  { test: startsWith("/funcionarios"), questions: () => ["¿Quién es el gobernador?", SALARIES, "¿Quiénes son los senadores?"] },
  {
    test: startsWith("/partidos"),
    questions: () => ["¿Quiénes son los diputados?", "¿Quiénes son los senadores?", "¿Quién es el gobernador?"],
  },
  { test: startsWith("/leyes"), questions: () => ["¿Cuáles son las últimas leyes?", UNPUBLISHED, REQUEST] },
  { test: startsWith("/no-publicado"), questions: () => [UNPUBLISHED, SALARIES, REQUEST] },
  { test: startsWith("/recaudacion"), questions: () => ["¿Cuánto recauda la Provincia?", "¿Cuánto recauda Ingresos Brutos?", DEBT] },
  { test: startsWith("/deuda"), questions: () => [DEBT, "¿Cuánto debe cada habitante?", "¿Cuánto recauda la Provincia?"] },
  {
    test: startsWith("/empleo-publico"),
    questions: () => ["¿Cuántos estatales hay?", "¿Cuánta gente trabaja en Salud?", SALARIES],
  },
  {
    test: startsWith("/poblacion"),
    questions: () => ["¿Cuánta gente vive en Mendoza?", "¿Cuánto le toca a Maipú?", "¿Cuántos estatales hay?"],
  },
  { test: startsWith("/senales"), questions: () => ["¿Qué son las señales?", TOP_SUPPLIERS, "¿Qué compró el Hospital Central?"] },
];

/** Las tres sugerencias para la ruta (`/municipios/godoy-cruz`); las de siempre si la página no tiene reglas propias. */
export function suggestionsFor(pathname: string): string[] {
  const clean = (pathname.split(/[?#]/)[0] ?? "").replace(/\/+$/, "") || "/";
  return (RULES.find((r) => r.test(clean))?.questions(clean) ?? DEFAULT).slice(0, 3);
}
