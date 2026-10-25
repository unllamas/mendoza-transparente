import { slug } from "@/slug.ts";
import type { NoPublicado } from "@/types.ts";

/**
 * A letter goes to one body under Ley 9070: national bodies (Ley 27.275) and items addressed to several bodies at once
 * ("Cámara de Diputados y Cámara de Senadores", "Los 18 municipios") are left out. Shared by the build and /no-publicado.
 */
export const singleBody = (item: NoPublicado) =>
  (item.ley ?? "9070") === "9070" &&
  !/,|municipios|municipalidades| y (Cámara|Ministerio|Dirección|Secretaría|Municipalidad)/i.test(item.organismo);

/** "Municipalidad de Godoy Cruz" → "Godoy Cruz": the item goes with that municipality's letter. */
export const municipalityName = (organismo: string) => organismo.match(/^Municipalidad de (.+)$/)?.[1];

/** ?para= of /pedir for a no-publicado.yaml item. */
export function letterTargetId(item: NoPublicado) {
  const town = municipalityName(item.organismo);
  return town ? `muni-${slug(town)}` : `org-${slug(item.organismo)}`;
}
