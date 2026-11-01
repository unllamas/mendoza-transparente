import { describe, expect, test } from "bun:test";

import { costFrom, countryOf, datesFrom, parseMission } from "./misiones-oficiales.ts";

const wrap = (considerandos: string, body: string, date = "MENDOZA, 26 DE AGOSTO DE 2026") =>
  `${date}\n\nVisto la necesidad de autorizar la salida del país; y\n\nCONSIDERANDO:\n\n${considerandos}\n\nEL GOBERNADOR DE LA PROVINCIA\n\nDECRETA:\n\n${body}\n\nArtículo 2° - Comuníquese, publíquese, dese al Registro Oficial y archívese.\n`;

describe("misiones-oficiales", () => {
  test("ministra a Santiago de Chile, con gastos a cargo de la Provincia (decreto 1757/2026)", () => {
    const res = parseMission(
      wrap(
        "Que para la asistencia al mencionado evento la Provincia de Mendoza se hará cargo de los vuelos, estadía y viáticos de la funcionaria.",
        "Artículo 1° - Autorícese la salida del territorio de la Provincia de Mendoza, con destino a la Ciudad de Santiago de Chile, República de Chile, de la Sra. Ministra de Energía y Ambiente, Abog. JIMENA HEBE LATORRE, D.N.I. Nº 32.427.363, desde el día 26 al 29 de agosto del corriente año, quien participará en Misión Oficial de los eventos denominados: “CUMBRE DE LA MINERÍA 2026”.",
      ),
      "2026",
    );
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      persona: "JIMENA HEBE LATORRE",
      cargo: "Ministra de Energía y Ambiente",
      destino: "Santiago de Chile, República de Chile",
      pais: "Chile",
      desde: "2026-08-26",
      hasta: "2026-08-29",
      motivo: "CUMBRE DE LA MINERÍA 2026",
      costo: "paga_provincia",
    });
    // El DNI nunca se guarda.
    expect(JSON.stringify(res)).not.toContain("32.427");
  });

  test("dos personas, cada una con su cargo después del DNI", () => {
    const res = parseMission(
      wrap(
        "Que la presente no implica gastos para el Estado Provincial.",
        "Artículo 1º - Autorícese al Señor JOSÉ MARÍA VIDELA SAENZ, D.N.I. Nº 27.090.904, Subsecretario de Relaciones Institucionales del Ministerio de Gobierno, Infraestructura y Desarrollo Territorial y al Sr. PABLO MIGUEL SARALE, D.N.I. Nº 24.866.566, Subsecretario de Comunicación, Prensa y Protocolo, a participar del Seminario “Atracción de Inversiones”, a realizarse en la República Federativa de Brasil, entre los días 29 de junio al 02 de julio de 2025.",
        "MENDOZA, 26 DE JUNIO DE 2025",
      ),
      "2025",
    );
    expect(res.map((r) => [r.persona, r.cargo])).toEqual([
      [
        "JOSÉ MARÍA VIDELA SAENZ",
        "Subsecretario de Relaciones Institucionales del Ministerio de Gobierno, Infraestructura y Desarrollo Territorial",
      ],
      ["PABLO MIGUEL SARALE", "Subsecretario de Comunicación, Prensa y Protocolo"],
    ]);
    expect(res[0]).toMatchObject({ pais: "Brasil", desde: "2025-06-29", hasta: "2025-07-02", costo: "sin_costo" });
  });

  test("sin DNI y con fecha de regreso aparte", () => {
    const res = parseMission(
      wrap(
        "Que la organización del evento se hará cargo de los vuelos y estadía.",
        "Artículo 1° - Autorícese la salida del territorio de la República y de la Provincia de Mendoza de la Sra. Ministra de Energía y Ambiente, Abog. JIMENA HEBE LATORRE, a partir del día 27 de febrero de 2026, con destino a las ciudades de Toronto (Canadá) y Nueva York (Estados Unidos de América), a fin de participar en Misión Oficial en los eventos denominados Convención Anual “PDAC 2026”, con regreso el 13 de marzo de 2026.",
      ),
      "2026",
    );
    expect(res[0]).toMatchObject({ persona: "JIMENA HEBE LATORRE", desde: "2026-02-27", hasta: "2026-03-13", costo: "paga_tercero" });
  });

  test("una norma que no es una misión oficial no devuelve nada", () => {
    expect(
      parseMission(
        wrap("Que corresponde.", "Artículo 1° - Desígnese al Sr. JUAN PÉREZ, D.N.I. Nº 20.123.456, en el cargo de Director."),
        "2026",
      ),
    ).toEqual([]);
  });

  test("fechas", () => {
    expect(datesFrom("desde el día 24 y hasta el 29 de septiembre del corriente año", "2025")).toEqual({
      desde: "2025-09-24",
      hasta: "2025-09-29",
    });
    expect(datesFrom("desde día sábado 15 de febrero y hasta el domingo 16 de febrero de 2025", "2025")).toEqual({
      desde: "2025-02-15",
      hasta: "2025-02-16",
    });
    expect(datesFrom("a partir del día miércoles 17 de abril de 2024 y hasta la finalización de las actividades", "2024")).toEqual({
      desde: "2024-04-17",
      hasta: "",
    });
  });

  test("costo: solo viáticos no es lo mismo que sin costo", () => {
    expect(
      costFrom("Que la asistencia al mencionado evento no generará erogaciones en concepto de viáticos para la Provincia de Mendoza.")
        .costo,
    ).toBe("sin_viaticos");
    expect(costFrom("Que la designación no es un viaje.").costo).toBe("no_informa");
  });

  test("países", () => {
    expect(countryOf("Arequipa, Perú")).toBe("Perú");
    expect(countryOf("las Ciudades de Hamburgo, Bruselas")).toBe("Alemania, Bélgica");
  });
});
