import { describe, expect, test } from "bun:test";

import { cleanPage, parseActa, prettyParty, splitNames, verifyElection } from "./junta-electoral.ts";

const START = /(?:resultaron\s+electos|lectura\s+del\s+acta)\s*:/;
const parse = (text: string, nameOrder: "nombre_apellido" | "apellido_coma_nombre" | "apellido_nombre") =>
  parseActa([text], { key: "test", nameOrder, startRe: START }).elected;

describe("junta-electoral", () => {
  test("acta con «Nombre APELLIDO» y frentes (formato 2019)", () => {
    const e = parse(
      "…que resultaron electos: GOBERNADOR: por el Frente Cambia Mendoza: Rodolfo Alejandro SUAREZ; VICEGOBERNADOR: por el Frente Cambia Mendoza: Mario Enrique Néstor ABED; SENADORES POR LA PRIMERA SECCION: por el Frente Cambia Mendoza: Natalia EISENCHLAS; Marcelo RUBIO y Gladys ROCCA; por la Alianza Elegí Mendoza Frente Político y Social: Cecilia JURI; INTENDENTES: DE LA CIUDAD DE MENDOZA: por el Frente Cambia Mendoza: Ulpiano SUAREZ; DEL DEPARTAMENTO DE LAVALLE: por el Frente Elegí: Roberto RIGHI; CONCEJALES: DE LA CIUDAD DE MENDOZA: Por el Frente Cambia Mendoza: Beatriz MARTINEZ LEJARZA; José MIGLIOZZI; DEL DEPARTAMENTO DE LAVALLE: por el Frente Elegí: Claudia SEGOVIA. Firman la presente Acta",
      "nombre_apellido",
    );
    expect(e.map((x) => [x.cargo, x.jurisdiccion, x.nombre, x.partido])).toEqual([
      ["gobernador", "Provincia de Mendoza", "Rodolfo Alejandro Suarez", "Frente Cambia Mendoza"],
      ["vicegobernador", "Provincia de Mendoza", "Mario Enrique Néstor Abed", "Frente Cambia Mendoza"],
      ["senador_provincial", "Primera", "Natalia Eisenchlas", "Frente Cambia Mendoza"],
      ["senador_provincial", "Primera", "Marcelo Rubio", "Frente Cambia Mendoza"],
      ["senador_provincial", "Primera", "Gladys Rocca", "Frente Cambia Mendoza"],
      ["senador_provincial", "Primera", "Cecilia Juri", "Alianza Elegí Mendoza Frente Político y Social"],
      ["intendente", "Capital", "Ulpiano Suarez", "Frente Cambia Mendoza"],
      ["intendente", "Lavalle", "Roberto Righi", "Frente Elegí"],
      ["concejal", "Capital", "Beatriz Martinez Lejarza", "Frente Cambia Mendoza"],
      ["concejal", "Capital", "José Migliozzi", "Frente Cambia Mendoza"],
      ["concejal", "Lavalle", "Claudia Segovia", "Frente Elegí"],
    ]);
    expect(e.find((x) => x.nombre === "Marcelo Rubio")!.orden).toBe(2);
  });

  test("el vicegobernador sin partido en el acta queda sin partido (no se infiere)", () => {
    const e = parse(
      "que resultaron electos: GOBERNADOR: por la Alianza Cambia Mendoza el ciudadano Alfredo CORNEJO; VICE-GOBERNADOR: la ciudadana Laura MONTERO; SENADORES POR LA PRIMERA SECCION ELECTORAL: por la Alianza Cambia Mendoza, los ciudadanos: Marcelo RUBIO y Daniela GARCIA. Firman",
      "nombre_apellido",
    );
    expect(e[0]).toMatchObject({ cargo: "gobernador", partido: "Alianza Cambia Mendoza", nombre: "Alfredo Cornejo" });
    expect(e[1]).toMatchObject({ cargo: "vicegobernador", partido: "", nombre: "Laura Montero" });
  });

  test("«APELLIDO, Nombre» con municipios sueltos (formato 2017)", () => {
    const e = parse(
      "que resultaron electos: CONCEJALES: CAPITAL: por la Alianza CAMBIA MENDOZA: ESPINA, Pablo; DELLA GASPERA, Fabiana y RIOS, Roberto; por el FRENTE SOMOS MENDOZA: ESPECHE, Carlos Ernesto; SAN CARLOS: por la Alianza JUNTOS POR SAN CARLOS: SARA, M. de los Angeles; LUJAN DE CUYO: por la Alianza CAMBIA MENDOZA: SALA, Carlos. Firman",
      "apellido_coma_nombre",
    );
    expect(e.map((x) => [x.jurisdiccion, x.nombre, x.partido])).toEqual([
      ["Capital", "Pablo Espina", "Alianza Cambia Mendoza"],
      ["Capital", "Fabiana Della Gaspera", "Alianza Cambia Mendoza"],
      ["Capital", "Roberto Rios", "Alianza Cambia Mendoza"],
      ["Capital", "Carlos Ernesto Espeche", "Frente Somos Mendoza"],
      ["San Carlos", "M. de los Angeles Sara", "Alianza Juntos por San Carlos"],
      ["Luján de Cuyo", "Carlos Sala", "Alianza Cambia Mendoza"],
    ]);
  });

  test("acta de 2023: apellido primero, sin coma tras el partido y gobernador con vice", () => {
    const e = parse(
      "que resultaron electos: GOBERNADOR DE LA PROVINCIA DE MENDOZA y VICEGOBERNADORA: por Cambia Mendoza CORNEJO ALFREDO VICTOR y CASADO HEBE SILVINA. SENADORES POR LA PRIMERA SECCION: por Cambia Mendoza, IGLESIAS MARCELINO OSCAR y SEVILLA OSCAR ALBERTO; por la Unión Mendocina, QUATTRINI MARCOS ENRIQUE, por el Partido Verde CHAPPEL DUGAR EDUARDO; INTENDENTE DE TUNUYÁN, por Elegí Gestión Tunuyán, ANDRAOS JOSE EMIR, CONCEJALES POR EL DEPARTAMENTO TUNUYÁN: por Elegí Gestión Tunuyán, AVEIRO MARTIN GUILLERMO; por el Frente Libertario, Demócratas y Jubilados, ANTOLIN MARTIN MARIO. Firman",
      "apellido_nombre",
    );
    expect(e[0]).toMatchObject({ cargo: "gobernador", nombre: "Cornejo Alfredo Victor", partido: "Cambia Mendoza" });
    expect(e[1]).toMatchObject({ cargo: "vicegobernador", nombre: "Casado Hebe Silvina" });
    expect(e.find((x) => x.nombre === "Quattrini Marcos Enrique")!.partido).toBe("La Unión Mendocina");
    expect(e.find((x) => x.nombre === "Chappel Dugar Eduardo")!.partido).toBe("Partido Verde");
    expect(e.find((x) => x.cargo === "intendente")).toMatchObject({ jurisdiccion: "Tunuyán", nombre: "Andraos Jose Emir" });
    expect(e.find((x) => x.nombre === "Antolin Martin Mario")).toMatchObject({
      cargo: "concejal",
      partido: "Frente Libertario, Demócratas y Jubilados",
    });
  });

  test("no copia el documento de identidad de la persona", () => {
    const n = splitNames("la ciudadana: TRIGO, Norma Viviana, D.N.l. Nº 14.006.755.-.", "apellido_coma_nombre");
    expect(n).toEqual([{ raw: "TRIGO, Norma Viviana", display: "Norma Viviana Trigo" }]);
  });

  test("un partido desconocido o un nombre dudoso cortan en vez de publicar mal", () => {
    expect(() =>
      parse("que resultaron electos: SENADORES POR LA PRIMERA SECCION: por la Alianza Nueva, Ana PEREZ. Firman", "nombre_apellido"),
    ).toThrow();
    expect(() => splitNames("Ana P3REZ", "nombre_apellido")).toThrow();
  });

  test("cleanPage quita el encabezado repetido, el guion de fin de renglón y la basura del escaneo", () => {
    const page = ",.44\nH. Junta Electoral\nde la Provincia\nMendoza\nDE GUAYMALLEN: por el Fren-\nte Cambia Mendoza: Martin CONTE;\n844";
    expect(cleanPage(page, 2)).toBe("DE GUAYMALLEN: por el Frente Cambia Mendoza: Martin CONTE;");
  });

  test("prettyParty normaliza mayúsculas sin cambiar el texto", () => {
    expect(prettyParty("Alianza_FRENTE_PARA_LA_VICTORIA_2")).toBe("Alianza Frente para la Victoria 2");
    expect(prettyParty("FRENTE_de_IZQUIERDA_y_de_los_TRABAJADORES")).toBe("Frente de Izquierda y de los Trabajadores");
  });

  test("verifyElection detecta bancas de menos", () => {
    const e = parse("que resultaron electos: SENADORES POR LA PRIMERA SECCION: por Cambia Mendoza, Ana PEREZ. Firman", "nombre_apellido");
    expect(verifyElection("t", e, { legislature: true, intendentes: null }).length).toBeGreaterThan(0);
  });
});
