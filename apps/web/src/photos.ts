/**
 * Landscape photos for `LandscapePhoto`. All have a free license and are shown with their credit.
 * A new one is added with `bun scripts/photo.ts` (see docs/procesos/diseno.md, "Fotos de paisaje").
 */
export type Photo = {
  src: string;
  /** What it shows, as the credit says it: "Viñedo en el Valle de Uco". */
  title: string;
  author: string;
  license: string;
  /** Page of the photo, with its license. */
  url: string;
  /** Which part stays in view when the band crops it (CSS `object-position`). */
  focus?: string;
};

export const PHOTOS = {
  "cordon-del-plata": {
    src: "/fotos/cordon-del-plata.jpg",
    title: "Cordón del Plata",
    author: "sebaslynx",
    license: "CC BY-SA 3.0",
    url: "https://commons.wikimedia.org/wiki/File:Vista_a_Cord%C3%B3n_del_Plata_-_panoramio.jpg",
    focus: "50% 40%",
  },
  "valle-de-uco": {
    src: "/fotos/valle-de-uco.jpg",
    title: "Viñedo frente a la cordillera, Valle de Uco",
    author: "David",
    license: "CC BY 2.0",
    url: "https://commons.wikimedia.org/wiki/File:Vineyard_in_Mendoza,_Argentina.jpg",
    focus: "50% 62%",
  },
} satisfies Record<string, Photo>;

export type PhotoId = keyof typeof PHOTOS;
