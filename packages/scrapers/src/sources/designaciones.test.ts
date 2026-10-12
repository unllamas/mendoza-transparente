import { describe, expect, test } from "bun:test";

import { classifyArticle, headerDate, parseNorm, redact, splitArticles } from "./designaciones.ts";

const wrap = (body: string, date = "MENDOZA, 05 DE AGOSTO DE 2026") =>
  `${date}\n\nVisto el expediente...\n\nEL GOBERNADOR DE LA PROVINCIA\n\nDECRETA:\n\n${body}\n\nArtículo 9º- Comuníquese, publíquese, dése al Registro Oficial y archívese.\n`;

const parse = (body: string) => parseNorm(wrap(body), { fecha: "2026-09-14" });

describe("designaciones", () => {
  test("designación interina en bloque (decreto de Salud, 14/09/2026)", () => {
    const { acts } = parse(`Artículo 2º- Desígnese interinamente y hasta tanto se cubra el cargo por concurso a la persona que a continuación se menciona, en el cargo que se consigna, con funciones en la dependencia que se detalla:

JURISDICCIÓN 08 – CARÁCTER 2

HOSPITAL CENTRAL - UNIDAD ORGANIZATIVA 01

CATEGORÍA 16 – Cód. 38-1-2-1 – Médico – Agrupamiento Servicios Médicos de Guardia – 36 hs. semanales.

Dr. MAURO FACUNDO ALVARADO, DNI N° 37.269.721, CUIL N° 20-37269721-1.`);
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({
      accion: "designa",
      modalidad: "interina",
      persona: "MAURO FACUNDO ALVARADO",
      reparticion: "HOSPITAL CENTRAL",
      articulo: "2",
    });
    expect(acts[0]!.cargo).toBe("Médico – Agrupamiento Servicios Médicos de Guardia – 36 hs. semanales");
  });

  test("designación en una oración: DNI y CUIL nunca se guardan", () => {
    const { acts } = parse(
      "Artículo 1°- Desígnese al Sr. JUAN RICARDO MILLAN, DNI Nº 23.939.153, CUIL N° 20-23939153-3, en el cargo de Clase 071 - Cód. 01-2-00-04 – Asesor de Gabinete – Jefe de Prensa, Unidad Organizativa 01 – Carácter 1 – Jurisdicción 08 – Ministerio de Salud y Deportes.",
    );
    expect(acts).toHaveLength(1);
    expect(acts[0]!.persona).toBe("JUAN RICARDO MILLAN");
    expect(acts[0]!.cargo).toBe("Asesor de Gabinete – Jefe de Prensa");
    expect(acts[0]!.reparticion).toBe("Ministerio de Salud y Deportes");
    expect(JSON.stringify(acts)).not.toMatch(/\d{2}\.\d{3}\.\d{3}|20-\d{8}-\d|DNI|CUIL/);
  });

  test("juez: nombre en mayúsculas y cargo hasta el punto final", () => {
    const { acts } = parse(
      "Artículo 1º - Desígnese a partir de la fecha del presente decreto, a la Dra. MARCELA CECILIA RUIZ DIAZ, D.N.I. Nº 22.973.442, en el cargo de Juez de la 2º Cámara Civil, Comercial, Minas, de Paz y Tributaria, de la Primera Circunscripción Judicial.",
    );
    expect(acts[0]!.persona).toBe("MARCELA CECILIA RUIZ DIAZ");
    expect(acts[0]!.cargo).toContain("Juez de la 2º Cámara Civil");
    expect(acts[0]!.desde).toBe("2026-08-05");
  });

  test("tabla de personal policial: una fila por persona, sin DNI ni año de nacimiento", () => {
    const { acts } = parse(`Artículo 1º - Desígnese, a partir de la emisión de la presente norma legal, en el cargo Carácter 1 – Jurisdicción 16 – Unidad Organizativa 06 - Clase 01 – Régimen Salarial 12 – Agrupamiento 1 – Tramo 01 – Subtramo 01 – U.G.G. J00098 –AUXILIAR– de las Policías de la Provincia de Mendoza, conforme lo previsto por los artículos 47, 49 y 52 de la Ley N° 6722 y modificatorias, al personal que se detalla a continuación:

APELLIDOS Y NOMBRES

CLASE

D.N.I

ARCE CABELLO, ALEXANDER JUAN JOEL

2006

48.608.900

BUSTOS GOMEZ, BRISA NAIR

2004

45.966.448`);
    expect(acts.map((a) => a.persona)).toEqual(["ARCE CABELLO, ALEXANDER JUAN JOEL", "BUSTOS GOMEZ, BRISA NAIR"]);
    expect(acts[0]!.cargo).toBe("Auxiliar de las Policías de la Provincia de Mendoza");
    expect(JSON.stringify(acts)).not.toMatch(/48\.608|2006/);
  });

  test("renuncia aceptada por jubilación", () => {
    const { acts } = parse(
      "Artículo 1º- Téngase por aceptada la renuncia, a partir del 22 de junio de 2026, de la agente MARIA DEL CARMEN LUDOVICO, C.U.I.L. N° 27-17573568-8, al cargo Clase 010, Jefe de División (Efectivo), Código Escalafonario: 05-1-03-08, de la JURISDICCION 05- Ministerio de Gobierno, Infraestructura y Desarrollo Territorial, UNIDAD ORGANIZATIVA 02- Dirección de Registro Civil y Capacidad de las Personas, por haberse acogido a los beneficios de la jubilación ordinaria.",
    );
    expect(acts[0]).toMatchObject({
      accion: "renuncia",
      modalidad: "jubilacion",
      persona: "MARIA DEL CARMEN LUDOVICO",
      desde: "2026-06-22",
      reparticion: "Dirección de Registro Civil y Capacidad de las Personas",
    });
    expect(acts[0]!.cargo).toBe("Jefe de División (Efectivo)");
  });

  test("cesantía como sanción", () => {
    const { acts } = parse(
      "Artículo 1° - Aplicar la sanción de CESANTÍA al Sr. SELTZER, FEDERICO ARIEL, CUIL N° 20-30536155-1 y realizar la Baja Administrativa correspondiente a la modalidad de Planta Permanente.",
    );
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({ accion: "cese", modalidad: "cesantia", persona: "SELTZER, FEDERICO ARIEL" });
  });

  test("encargo interino de una cartera", () => {
    const { acts } = parse(
      "Artículo 1º - Encárguese interinamente la Cartera del Ministerio de Gobierno, Infraestructura y Desarrollo Territorial, a partir del día 27 de agosto de 2026, mientras dure la ausencia de su titular, Abg. NATALIO MEMA RODRIGUEZ, al señor Ministro de Hacienda y Finanzas, VICTOR FAYAD.",
    );
    expect(acts[0]).toMatchObject({ accion: "otro", modalidad: "encargo_cartera", persona: "VICTOR FAYAD", desde: "2026-08-27" });
  });

  test("lo que no es un acto de personal no genera filas", () => {
    expect(classifyArticle("Téngase por aceptada la donación efectuada por la UNIVERSIDAD DE MENDOZA")).toBeNull();
    expect(classifyArticle("Acéptese formalmente y rechácese sustancialmente el Recurso Jerárquico interpuesto por el Dr. X")).toBeNull();
    expect(classifyArticle("Desígnese el nombre “Héroes del Ara San Juan”, al mástil")).toBeNull();
    expect(parse("Artículo 1º - Desígnese a los “miembros que conformarán el jurado” del concurso.")).toMatchObject({ acts: [], discarded: 1 });
  });

  test("utilidades", () => {
    expect(headerDate("MENDOZA, 24 DE JULIO DE 2026\n")).toBe("2026-07-24");
    expect(redact("Dra. X, DNI Nº 28.475.489, CUIL Nº 27-28475489-7, clase 1970")).not.toMatch(/\d{2}\.\d{3}/);
    expect(splitArticles("Artículo 1º- A\nArt. 2º).- B\nArtículo 64 de la ley")).toHaveLength(2);
  });
});
