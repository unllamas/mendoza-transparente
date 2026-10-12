/**
 * Catalog of analytics events: what each one means, in Spanish, as it shows up in PostHog.
 * `bun run posthog-sync` copies these descriptions to PostHog (docs/procesos/analitica.md).
 * When adding a `data-track` or `track()` call, add its event here too.
 */

export interface EventDoc {
  event: string;
  description: string;
  tags: string[];
}

export const EVENT_CATALOG: EventDoc[] = [
  { event: "$pageview", description: "Vio una página del sitio.", tags: ["navegación"] },
  { event: "$pageleave", description: "Salió de una página (cerró la pestaña o fue a otra).", tags: ["navegación"] },
  { event: "$web_vitals", description: "Medición de velocidad de carga de la página (Core Web Vitals).", tags: ["rendimiento"] },
  { event: "nav.mobile_menu.toggle", description: "Abrió o cerró el menú en el celular. Propiedad open: si lo abrió.", tags: ["navegación"] },
  { event: "nav.group.toggle", description: "Abrió o cerró un grupo del menú (Gobierno, Datos, Compras del Estado, Transparencia). Propiedades group y open.", tags: ["navegación"] },
  { event: "footer.report_error", description: "Tocó «¿Encontraste un error? Avisanos» en el pie de página.", tags: ["participación"] },
  { event: "sheet.open", description: "Abrió una hoja de detalle (un pedido, un proceso de compra, un proveedor, una fila de datos). Propiedad sheet: cuál.", tags: ["interacción"] },
  { event: "sheet.close", description: "Cerró una hoja de detalle. Propiedades sheet y seconds: cuánto tiempo la tuvo abierta.", tags: ["interacción"] },
  { event: "sheet.close_button", description: "Cerró una hoja de detalle con el botón de cerrar (en vez de tocar afuera o usar Escape).", tags: ["interacción"] },
  { event: "segmented.change", description: "Cambió de pestaña en un selector. Propiedades value y label.", tags: ["interacción"] },
  { event: "search.query", description: "Buscó algo en un buscador del sitio (leyes, proveedores, funcionarios). Propiedades search: qué buscador, y query: qué escribió.", tags: ["búsqueda"] },
  { event: "link.outbound", description: "Abrió un link a otro sitio: fuente oficial, PDF, Boletín, ARCA. Propiedades host y href.", tags: ["fuentes"] },
  { event: "data.download", description: "Descargó un archivo de datos (CSV, JSON, XLSX). Propiedad file.", tags: ["datos abiertos"] },
  { event: "missing_data.theme.toggle", description: "En «Lo que no se publica», filtró por tema (la plata pública, quiénes trabajan en el Estado…). Propiedades theme y active.", tags: ["no publicado"] },
  { event: "missing_data.theme.clear", description: "En «Lo que no se publica», volvió a ver todos los temas.", tags: ["no publicado"] },
  { event: "missing_data.request.open", description: "Abrió el pedido de un dato que el Estado no publica. Propiedades item: qué dato, y theme.", tags: ["no publicado", "embudo de pedidos"] },
  { event: "missing_data.request.copy", description: "Copió el texto del pedido de acceso a la información. Propiedades item y edited: si lo modificó antes de copiarlo.", tags: ["no publicado", "embudo de pedidos"] },
  { event: "missing_data.request.official_form", description: "Fue al formulario oficial del Gobierno para presentar el pedido. Propiedad item.", tags: ["no publicado", "embudo de pedidos"] },
  { event: "missing_data.request.register_filing", description: "Desde un pedido, fue a registrar su número de trámite en «Participá». Propiedad item.", tags: ["no publicado", "embudo de pedidos"] },
  { event: "missing_data.request.where_we_looked", description: "Abrió uno de los sitios oficiales donde buscamos el dato. Propiedad item.", tags: ["no publicado"] },
  { event: "missing_data.law.open", description: "Abrió el texto de la Ley 9070 de acceso a la información.", tags: ["no publicado"] },
  { event: "law.official_pdf.open", description: "Abrió el PDF oficial de una ley. Propiedad law: número.", tags: ["leyes"] },
  { event: "law.full_text.toggle", description: "Desplegó o plegó el texto completo de una ley. Propiedad law.", tags: ["leyes"] },
  { event: "participation.form.change", description: "En «Participá», cambió de formulario (pedido, respuesta, error, dato). Propiedad value.", tags: ["participación"] },
  { event: "participation.request.success", description: "Registró un pedido de acceso a la información con su número de trámite.", tags: ["participación", "embudo de pedidos"] },
  { event: "participation.request.error", description: "Falló el registro de un pedido (dato inválido, trámite repetido o sin conexión). Propiedad status: código de respuesta.", tags: ["participación"] },
  { event: "participation.answer.success", description: "Contó qué le respondió el Estado a un pedido registrado.", tags: ["participación"] },
  { event: "participation.answer.error", description: "Falló el envío de una respuesta (por ejemplo, número de trámite no registrado). Propiedad status.", tags: ["participación"] },
  { event: "participation.bug.success", description: "Reportó un error del sitio.", tags: ["participación"] },
  { event: "participation.bug.error", description: "Falló el envío de un reporte de error. Propiedad status.", tags: ["participación"] },
  { event: "participation.data_suggestion.success", description: "Sugirió un dato para sumar al sitio.", tags: ["participación"] },
  { event: "participation.data_suggestion.error", description: "Falló el envío de una sugerencia. Propiedad status.", tags: ["participación"] },
  { event: "pedido-registrar.click", description: "Tocó «Registrar pedido» en «Participá» (antes de saber si el envío funcionó).", tags: ["participación"] },
  { event: "respuesta-enviar.click", description: "Tocó «Enviar respuesta» en «Participá».", tags: ["participación"] },
  { event: "error-enviar.click", description: "Tocó «Enviar» en el formulario de errores.", tags: ["participación"] },
  { event: "dato-enviar.click", description: "Tocó «Enviar» en el formulario de sugerencias de datos.", tags: ["participación"] },
];
