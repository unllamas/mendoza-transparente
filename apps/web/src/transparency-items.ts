import type { TransparencyItemId } from "./types.ts";

/**
 * The nine things the law asks a municipality to publish: what each one is, in the words a neighbor would use, the law
 * that asks for it, and the point to write in a request letter when it is missing. Shared by the municipality page, the
 * request letter (/pedir) and the posters (/cartel); the build also reads it (scripts/temas/civic-tools.ts).
 */
export const TRANSPARENCY_ITEMS: Record<TransparencyItemId, { label: string; what: string; law: string; request: string }> = {
  presupuesto: {
    label: "Presupuesto del año",
    what: "Cuánta plata piensa gastar el municipio en el año y en qué.",
    law: "Ley 7314 de Responsabilidad Fiscal",
    request: "La ordenanza de presupuesto de gastos y cálculo de recursos del ejercicio en curso, con sus anexos.",
  },
  ejecucion: {
    label: "Ejecución del gasto",
    what: "Cuánto gastó de verdad, trimestre a trimestre (anexos 2 a 5 de Responsabilidad Fiscal).",
    law: "Ley 7314 de Responsabilidad Fiscal",
    request:
      "La ejecución presupuestaria del ejercicio en curso hasta el último trimestre cerrado, por finalidad, función y objeto del gasto.",
  },
  personal: {
    label: "Personal y contratos",
    what: "Cuántos cargos de planta y contratos tiene y cuánto se pagó (anexo 19 de Responsabilidad Fiscal).",
    law: "Ley 7314 de Responsabilidad Fiscal",
    request: "La cantidad de agentes de planta permanente, temporaria y contratados, y el monto liquidado en el último trimestre.",
  },
  deuda: {
    label: "Deuda",
    what: "Cuánto debe el municipio y a quién, trimestre a trimestre.",
    law: "Ley 7314 de Responsabilidad Fiscal",
    request: "La deuda al último trimestre cerrado, por acreedor, con su moneda, tasa y vencimientos.",
  },
  compras: {
    label: "Compras y licitaciones",
    what: "Qué compra el municipio, a quién y por cuánto.",
    law: "Ley 9070 de Acceso a la Información Pública",
    request:
      "El listado de compras y contrataciones de los últimos doce meses: fecha, objeto, procedimiento, proveedor adjudicado y monto de cada una.",
  },
  normas: {
    label: "Decretos y ordenanzas",
    what: "Las decisiones del intendente y del Concejo Deliberante, publicadas en un boletín o digesto.",
    law: "Ley 9070 de Acceso a la Información Pública",
    request: "Los decretos del Departamento Ejecutivo y las ordenanzas del Concejo Deliberante del año en curso.",
  },
  sueldos: {
    label: "Sueldos de las autoridades",
    what: "Cuánto cobran el intendente y sus secretarios.",
    law: "Ley 9070 de Acceso a la Información Pública",
    request:
      "La remuneración bruta mensual del intendente, los secretarios y los directores, con el detalle de adicionales, al último mes liquidado.",
  },
  declaraciones_juradas: {
    label: "Declaraciones juradas",
    what: "El patrimonio que declaran el intendente y los funcionarios.",
    law: "Ley 8993 de Ética Pública",
    request: "Las declaraciones juradas patrimoniales del intendente y los secretarios, o el organismo donde se pueden consultar.",
  },
  acceso_informacion: {
    label: "Canal para pedir información",
    what: "Un formulario, un correo o un área donde cualquier vecino puede pedir información pública.",
    law: "Ley 9070 de Acceso a la Información Pública",
    request: "El área, el funcionario responsable y el correo o formulario para presentar pedidos de acceso a la información pública.",
  },
};
