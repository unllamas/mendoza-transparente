/**
 * Landscape photos for `LandscapePhoto`. All have a free license and are shown with their credit.
 * A new one is added with `bun scripts/photo.ts` (see docs/procesos/diseno.md, "Fotos de paisaje").
 * Missing, waiting for a good free photo: Guaymallén, Junín and Rivadavia.
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
  // One per municipality, with its slug as id (see municipalityPhoto).
  capital: {
    src: "/fotos/capital.jpg",
    title: "Ciudad de Mendoza y la cordillera",
    author: "Itsmemarttin",
    license: "CC BY-SA 4.0",
    url: "https://commons.wikimedia.org/wiki/File:Vista_panor%C3%A1mica_del_sector_m%C3%A1s_moderno_de_la_ciudad,_donde_se_encuentran_algunas_de_las_torres_m%C3%A1s_altas_y_se_puede_observar_la_gran_forestaci%C3%B3n_de_%C3%A1rboles_y_parte_del_cord%C3%B3n_monta%C3%B1oso_de_Los_Andes..JPG",
    focus: "50% 40%",
  },
  "general-alvear": {
    src: "/fotos/general-alvear.jpg",
    title: "Atardecer en General Alvear",
    author: "Guiller Carrió",
    license: "CC BY-SA 4.0",
    url: "https://commons.wikimedia.org/wiki/File:Atardecer_en_Gral._Alvear,_Mendoza.jpg",
    focus: "50% 35%",
  },
  "godoy-cruz": {
    src: "/fotos/godoy-cruz.jpg",
    title: "Estadio Feliciano Gambarte",
    author: "Feliciano 1921",
    license: "CC0",
    url: "https://commons.wikimedia.org/wiki/File:Vista_General_2025.jpg",
    focus: "50% 45%",
  },
  "la-paz": {
    src: "/fotos/la-paz.jpg",
    title: "Río Desaguadero",
    author: "Leandro Kibisz",
    license: "CC BY-SA 4.0",
    url: "https://commons.wikimedia.org/wiki/File:Argentina_-_R%C3%ADo_Desaguadero.JPG",
    focus: "50% 60%",
  },
  "las-heras": {
    src: "/fotos/las-heras.jpg",
    title: "Puente del Inca",
    author: "Bernard Gagnon",
    license: "CC BY-SA 4.0",
    url: "https://commons.wikimedia.org/wiki/File:Puente_del_Inca_01.jpg",
    focus: "50% 55%",
  },
  lavalle: {
    src: "/fotos/lavalle.jpg",
    title: "Médanos de Lavalle",
    author: "Pablo Nazareno Alvar…",
    license: "CC BY 3.0",
    url: "https://commons.wikimedia.org/wiki/File:Dunas_-_panoramio_(8).jpg",
    focus: "50% 50%",
  },
  "lujan-de-cuyo": {
    src: "/fotos/lujan-de-cuyo.jpg",
    title: "Embalse Potrerillos",
    author: "Cobosch33",
    license: "CC BY-SA 4.0",
    url: "https://commons.wikimedia.org/wiki/File:Potrerillos_entre_nubes._Mendoza,_julio_de_2016.jpg",
    focus: "50% 50%",
  },
  maipu: {
    src: "/fotos/maipu.jpg",
    title: "Viñedos en Lunlunta",
    author: "Juniormaths.2022",
    license: "CC BY-SA 4.0",
    url: "https://commons.wikimedia.org/wiki/File:Paisaje_en_Lunlunta.jpg",
    focus: "50% 55%",
  },
  malargue: {
    src: "/fotos/malargue.jpg",
    title: "Volcanes de La Payunia",
    author: "alq666",
    license: "CC BY-SA 2.0",
    url: "https://commons.wikimedia.org/wiki/File:La_Payunia_-_Overview_(2039755978).jpg",
    focus: "50% 50%",
  },
  "san-carlos": {
    src: "/fotos/san-carlos.jpg",
    title: "Laguna del Diamante y volcán Maipo",
    author: "Fortunat",
    license: "CC BY-SA 3.0",
    url: "https://commons.wikimedia.org/wiki/File:Volcan_Maipo_et_sa_Lagune.JPG",
    focus: "50% 25%",
  },
  "san-martin": {
    src: "/fotos/san-martin.jpg",
    title: "Museo de las Bóvedas",
    author: "Stefano Gavosto",
    license: "CC BY-SA 4.0",
    url: "https://commons.wikimedia.org/wiki/File:Museo_la_B%C3%B3vedas,_San_Mart%C3%ADn,_Mendoza.jpg",
    focus: "50% 50%",
  },
  "san-rafael": {
    src: "/fotos/san-rafael.jpg",
    title: "Embalse Los Reyunos",
    author: "Pablo D. Flores",
    license: "CC BY-SA 2.5",
    url: "https://commons.wikimedia.org/wiki/File:Embalse_Los_Reyunos_(panorama).jpg",
    focus: "50% 50%",
  },
  "santa-rosa": {
    src: "/fotos/santa-rosa.jpg",
    title: "Reserva de Biosfera Ñacuñán",
    author: "Pablo Eugenio Villagra",
    license: "CC BY-SA 4.0",
    url: "https://commons.wikimedia.org/wiki/File:Ingreso_a_la_Reserva.jpg",
    focus: "50% 55%",
  },
  tunuyan: {
    src: "/fotos/tunuyan.jpg",
    title: "Viñedos en el Valle de Uco",
    author: "Analía Fiocca Solimei",
    license: "CC BY-SA 4.0",
    url: "https://commons.wikimedia.org/wiki/File:Ma%C3%B1anas_mendocinas.JPG",
    focus: "50% 35%",
  },
  tupungato: {
    src: "/fotos/tupungato.jpg",
    title: "Viñedos de Tupungato",
    author: "Daniel Velasquez",
    license: "CC BY-SA 4.0",
    url: "https://commons.wikimedia.org/wiki/File:Vi%C3%B1as_en_Tupungato_Mendoza.jpg",
    focus: "50% 48%",
  },
} satisfies Record<string, Photo>;

export type PhotoId = keyof typeof PHOTOS;

/** The site's landscape, for pages without their own (home page, share images). */
export const DEFAULT_PHOTO: PhotoId = "cordon-del-plata";

/** Each municipality's photo has its slug as id; the site's landscape while it has none of its own. */
export function municipalityPhoto(slug: string): PhotoId {
  return slug in PHOTOS ? (slug as PhotoId) : DEFAULT_PHOTO;
}
