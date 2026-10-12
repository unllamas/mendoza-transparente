/**
 * Glossary of the terms that confuse people most. Used by /como-leer and, as FAQ structured data, by the
 * page registry (scripts/paginas.ts). Keep the definitions short, neutral and in plain Spanish.
 */

export interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  /** Page where the term matters most. */
  seeAlso?: { label: string; to: string };
}

export const GLOSSARY: GlossaryTerm[] = [
  {
    id: "coparticipacion",
    term: "Coparticipación",
    definition:
      "La parte de los impuestos que la provincia reparte entre los 18 municipios según una fórmula fija por ley. Es la principal fuente de plata de la mayoría de los municipios.",
    seeAlso: { label: "Coparticipación por municipio", to: "/coparticipacion" },
  },
  {
    id: "pesos-de-hoy",
    term: "Pesos de hoy (valores reales)",
    definition:
      "Un monto de otro año pasado a pesos actuales con la inflación oficial (IPC). Sirve para comparar años distintos: $ 1.000 de 2018 compraban mucho más que $ 1.000 de hoy.",
  },
  {
    id: "contratacion-directa",
    term: "Contratación directa",
    definition:
      "Una compra del Estado sin licitación pública: el organismo elige o invita a proveedores. La ley la permite en casos puntuales (montos chicos, urgencias, un único proveedor posible), pero conviene mirar cuándo se usa.",
    seeAlso: { label: "Para mirar de cerca", to: "/senales" },
  },
  {
    id: "licitacion",
    term: "Licitación pública",
    definition: "Una compra abierta: se publica, cualquier empresa puede ofertar y se elige la mejor propuesta según reglas fijadas de antemano.",
  },
  {
    id: "una-sola-oferta",
    term: "Una sola oferta",
    definition:
      "Un proceso de compra al que se presentó un único proveedor. No es irregular en sí mismo, pero sin competencia es más difícil saber si el precio fue bueno.",
  },
  {
    id: "valor-fiscal",
    term: "Valor fiscal (avalúo)",
    definition:
      "El valor que el Estado le asigna a una casa, un terreno o un auto para cobrar impuestos. Suele estar muy por debajo del precio de mercado; por eso los patrimonios declarados parecen bajos.",
    seeAlso: { label: "Funcionarios y sus declaraciones", to: "/funcionarios" },
  },
  {
    id: "declaracion-jurada",
    term: "Declaración jurada patrimonial",
    definition:
      "El documento en el que un funcionario informa sus bienes, deudas e ingresos. En Mendoza se presenta ante la Oficina de Ética Pública, que publica solo una parte: los montos de cuentas y efectivo no se ven.",
  },
  {
    id: "cargos",
    term: "Cargos (no personas)",
    definition:
      "Los informes oficiales cuentan cargos: una persona puede ocupar más de uno (por ejemplo, un docente con dos cargos). Por eso hablamos de cargos y no de empleados.",
    seeAlso: { label: "Gobierno por dentro", to: "/gobierno" },
  },
  {
    id: "planta",
    term: "Planta permanente, temporaria y contratos",
    definition:
      "La planta permanente tiene estabilidad; la temporaria, un plazo. Los contratos de locación de servicios no son empleo público: se renuevan y no tienen estabilidad.",
  },
  {
    id: "deuda-publica",
    term: "Deuda pública",
    definition:
      "Lo que la provincia debe a bonistas, bancos y organismos internacionales. La medimos en dólares porque buena parte está en esa moneda.",
    seeAlso: { label: "Deuda de Mendoza", to: "/deuda" },
  },
  {
    id: "boletin-oficial",
    term: "Boletín Oficial",
    definition: "El diario donde el Gobierno publica leyes, decretos, resoluciones y designaciones. Una norma rige desde que se publica ahí.",
    seeAlso: { label: "Leyes", to: "/leyes" },
  },
  {
    id: "ley-9070",
    term: "Pedido de acceso a la información (Ley 9070)",
    definition:
      "Cualquier persona puede pedirle al Estado de Mendoza un dato público, gratis y sin explicar para qué. El organismo tiene 15 días hábiles para responder.",
    seeAlso: { label: "Lo que no se publica", to: "/no-publicado" },
  },
  {
    id: "senal",
    term: "Señal",
    definition:
      "Un patrón en los datos oficiales que merece una explicación: por ejemplo, muchas compras directas a la misma empresa. Una señal no prueba nada; es una pregunta para el organismo.",
    seeAlso: { label: "Para mirar de cerca", to: "/senales" },
  },
];
