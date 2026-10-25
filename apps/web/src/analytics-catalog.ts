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
  {
    event: "$dead_click",
    description: "Tocó algo que parece tocable y no pasó nada (clic sin respuesta). Propiedad $pathname con la página.",
    tags: ["navegación"],
  },
  {
    event: "$dead_swipe",
    description:
      "En el celular, deslizó sobre algo que parece deslizable y no pasó nada (gesto sin respuesta). Propiedad $pathname con la página.",
    tags: ["navegación"],
  },
  { event: "$web_vitals", description: "Medición de velocidad de carga de la página (Core Web Vitals).", tags: ["rendimiento"] },
  {
    event: "$exception",
    description:
      "Un error del sitio (Error tracking): uno no capturado, o el de una página que no pudo mostrarse (boundary: route). Propiedad path.",
    tags: ["errores"],
  },
  { event: "nav.mobile_menu.toggle", description: "Abrió el menú en el celular.", tags: ["navegación"] },
  { event: "nav.mobile_menu.close", description: "Cerró el menú del celular con la X (sin elegir ninguna página).", tags: ["navegación"] },
  {
    event: "nav.group.toggle",
    description: "Abrió o cerró un grupo del menú (Gobierno, Datos, Transparencia). Propiedades group y open.",
    tags: ["navegación"],
  },
  {
    event: "nav.link.open",
    description:
      "Tocó un destino principal del menú (hoy, «Para mirar de cerca»), en la computadora o en el celular. Propiedades to y place (header o mobile_menu).",
    tags: ["navegación"],
  },
  {
    event: "footer.report_error",
    description: "Tocó «Reportar un error» en la franja de arriba del pie. Propiedad path: la página donde lo vio.",
    tags: ["participación"],
  },
  {
    event: "share.open",
    description:
      "Abrió el menú del botón Compartir en la computadora (después elige X, WhatsApp o copiar, o lo cierra). Propiedades path y context (page o missing_data).",
    tags: ["compartir"],
  },
  {
    event: "share.x",
    description:
      "Tocó «Publicar en X» en el botón Compartir: se abre X con el texto, el link y #MendozaTransparente. Propiedades path y context (page o missing_data).",
    tags: ["compartir"],
  },
  {
    event: "share.whatsapp",
    description: "Tocó «Enviar por WhatsApp» en el botón Compartir. Propiedades path y context (page o missing_data).",
    tags: ["compartir"],
  },
  {
    event: "share.copy",
    description: "Copió el texto y el link desde el botón Compartir. Propiedades path y context (page o missing_data).",
    tags: ["compartir"],
  },
  {
    event: "share.section.copy",
    description:
      "Tocó el título de una sección (con el ícono de link): la página baja a esa sección, la URL queda con #sección y el link se copia. Propiedades path y section (el id, por ejemplo leyes o coparticipacion).",
    tags: ["compartir"],
  },
  {
    event: "share.native",
    description:
      "Tocó Compartir en el celular, que abre el menú de compartir del teléfono (no sabemos qué app eligió). Propiedades path y context.",
    tags: ["compartir"],
  },
  {
    event: "footer.friend_site.open",
    description: "Tocó un sitio amigo en el pie. Propiedades site (el dominio) y href (con los UTM).",
    tags: ["navegación"],
  },
  {
    event: "sheet.open",
    description: "Abrió una hoja de detalle (un pedido, un proceso de compra, un proveedor, una fila de datos). Propiedad sheet: cuál.",
    tags: ["interacción"],
  },
  {
    event: "sheet.close",
    description: "Cerró una hoja de detalle. Propiedades sheet y seconds: cuánto tiempo la tuvo abierta.",
    tags: ["interacción"],
  },
  {
    event: "sheet.close_button",
    description: "Cerró una hoja de detalle con el botón de cerrar (en vez de tocar afuera o usar Escape).",
    tags: ["interacción"],
  },
  {
    event: "purchase.awards_sort.change",
    description: "Cambió el orden de las adjudicaciones de un proceso de compra (mayor monto, menor monto, A–Z). Propiedad value.",
    tags: ["compras"],
  },
  {
    event: "signal.cases_sort.change",
    description:
      "Cambió el orden de los casos de una señal desde el botón «Ordenar» (relevantes, mayor o menor monto, más reciente o más antiguo). Propiedad value.",
    tags: ["compras"],
  },
  {
    event: "purchase.flag.toggle",
    description:
      "Tocó una alerta de un proceso de compra (sobre lo estimado, una sola oferta, contratación directa) para leer su explicación. Propiedad flag.",
    tags: ["compras"],
  },
  {
    event: "purchase.winner.open",
    description: "Abrió el perfil de la empresa que ganó sin competencia un proceso de compra.",
    tags: ["compras"],
  },
  {
    event: "purchase.supplier.agency_open",
    description: "Desde la hoja de un proveedor, abrió la página de un organismo que le compra.",
    tags: ["compras"],
  },
  { event: "segmented.change", description: "Cambió de pestaña en un selector. Propiedades value y label.", tags: ["interacción"] },
  {
    event: "search.query",
    description:
      "Buscó algo en un buscador del sitio (leyes, proveedores, funcionarios). Propiedades search: qué buscador, y query: qué escribió.",
    tags: ["búsqueda"],
  },
  {
    event: "link.outbound",
    description: "Abrió un link a otro sitio: fuente oficial, PDF, Boletín, ARCA. Propiedades host y href.",
    tags: ["fuentes"],
  },
  { event: "data.download", description: "Descargó un archivo de datos (CSV, JSON, XLSX). Propiedad file.", tags: ["datos abiertos"] },
  {
    event: "missing_data.stale.open",
    description:
      "Desde una página con datos viejos o incompletos (por ejemplo, la UNCuyo), tocó el link para ver cómo pedirlos al día. Propiedad item: el pedido en «Lo que no se publica».",
    tags: ["no publicado", "embudo de pedidos"],
  },
  {
    event: "glossary.term.open",
    description: "Tocó una palabra subrayada con puntos para ver qué significa (por ejemplo, «dedicación» o «devengado»). Propiedad term.",
    tags: ["comprensión"],
  },
  {
    event: "university.open",
    description: "En «Universidades», abrió la ficha de una universidad. Propiedad university.",
    tags: ["navegación"],
  },
  {
    event: "missing_data.theme.toggle",
    description:
      "En «Lo que no se publica», filtró por tema (la plata pública, quiénes trabajan en el Estado…). Propiedades theme y active.",
    tags: ["no publicado"],
  },
  { event: "missing_data.theme.clear", description: "En «Lo que no se publica», volvió a ver todos los temas.", tags: ["no publicado"] },
  {
    event: "missing_data.request.open",
    description: "Abrió el pedido de un dato que el Estado no publica. Propiedades item: qué dato, y theme.",
    tags: ["no publicado", "embudo de pedidos"],
  },
  {
    event: "missing_data.request.copy",
    description: "Copió el texto del pedido de acceso a la información. Propiedades item y edited: si lo modificó antes de copiarlo.",
    tags: ["no publicado", "embudo de pedidos"],
  },
  {
    event: "missing_data.request.official_form",
    description:
      "Fue a presentar el pedido: el formulario oficial de la provincia o de la Nación, o el correo del organismo. Propiedad item.",
    tags: ["no publicado", "embudo de pedidos"],
  },
  {
    event: "missing_data.request.register_filing",
    description: "Desde un pedido, fue a registrar su número de trámite en «Participá». Propiedad item.",
    tags: ["no publicado", "embudo de pedidos"],
  },
  {
    event: "missing_data.request.letter",
    description: "Desde un pedido de «Lo que no se publica», fue a armar la nota en PDF (/pedir). Propiedad item.",
    tags: ["no publicado", "embudo de pedidos"],
  },
  {
    event: "request_letter.target_picker.open",
    description: "En /pedir, abrió la lista para elegir a qué municipio u organismo le pide información.",
    tags: ["nota de pedido"],
  },
  {
    event: "request_letter.write.start",
    description:
      "En /pedir, tocó «Armar la nota» después de elegir a quién y qué pide. Propiedades target (municipio u organismo) y documents (cuántos).",
    tags: ["nota de pedido", "embudo de pedidos"],
  },
  {
    event: "request_letter.point.add",
    description: "En la nota de /pedir, sumó un punto escrito por la persona.",
    tags: ["nota de pedido"],
  },
  {
    event: "request_letter.remember.toggle",
    description: "En /pedir, marcó o desmarcó «Recordar mis datos en este dispositivo». Propiedad on. Los datos nunca se envían.",
    tags: ["nota de pedido"],
  },
  {
    event: "request_letter.download",
    description:
      "Descargó la nota de pedido en PDF. Anónimo: propiedades target (a quién), documents (ids de lo que pide), points, custom_points (puntos propios) y remembered. Nunca el texto ni los datos de la persona.",
    tags: ["nota de pedido", "embudo de pedidos"],
  },
  {
    event: "request_letter.text.copy",
    description: "Después de descargar la nota, copió su texto para pegarlo en el formulario en línea o en un correo. Propiedad target.",
    tags: ["nota de pedido", "embudo de pedidos"],
  },
  {
    event: "request_letter.official_form.open",
    description: "Después de descargar la nota, abrió el formulario oficial o el correo del organismo. Propiedad target.",
    tags: ["nota de pedido", "embudo de pedidos"],
  },
  {
    event: "poster.municipality_picker.open",
    description: "En /cartel, abrió la lista para elegir el municipio.",
    tags: ["carteles"],
  },
  {
    event: "poster.export",
    description:
      "Descargó o compartió un cartel. Propiedades municipality, topic (publica, falta, plata, gasto o empleo), item (el dato que falta), format (a4, square o story) y kind (pdf, png o share).",
    tags: ["carteles"],
  },
  {
    event: "missing_data.request.where_we_looked",
    description: "Abrió uno de los sitios oficiales donde buscamos el dato. Propiedad item.",
    tags: ["no publicado"],
  },
  {
    event: "missing_data.law.open",
    description: "Abrió el texto de una ley de acceso a la información. Propiedad law: 9070 (provincial) o 27275 (nacional).",
    tags: ["no publicado"],
  },
  {
    event: "officials.history.open",
    description: "Desde la página de funcionarios, abrió el historial: quién ocupó cada cargo antes y quién ganó cada elección.",
    tags: ["funcionarios"],
  },
  {
    event: "official.party.open",
    description:
      "Desde la ficha de un funcionario (o su lista de elecciones ganadas), abrió la página de su partido, frente o bloque. También desde la composición por bloque.",
    tags: ["funcionarios", "partidos"],
  },
  {
    event: "officials.history.party.open",
    description: "En el historial, abrió la página de un partido desde el reparto de cargos de una elección.",
    tags: ["funcionarios", "partidos"],
  },
  { event: "party.open", description: "En /partidos, abrió la página de un partido, frente o bloque.", tags: ["partidos"] },
  {
    event: "party.member.open",
    description: "En la página de un partido, abrió la ficha de alguien que hoy ocupa un cargo con ese nombre.",
    tags: ["partidos", "funcionarios"],
  },
  {
    event: "party.former.open",
    description:
      "En la página de un partido, abrió la ficha en el historial de alguien que ganó una elección con ese nombre y hoy no tiene cargo.",
    tags: ["partidos", "funcionarios"],
  },
  { event: "law.official_pdf.open", description: "Abrió el PDF oficial de una ley. Propiedad law: número.", tags: ["leyes"] },
  { event: "law.full_text.toggle", description: "Desplegó o plegó el texto completo de una ley. Propiedad law.", tags: ["leyes"] },
  {
    event: "law.place.open",
    description: "Abrió la página de un departamento desde el resumen de una ley. Propiedad law.",
    tags: ["leyes"],
  },
  {
    event: "law.signer.open",
    description: "Abrió la ficha de una persona que firma una ley. Propiedad law.",
    tags: ["leyes"],
  },
  {
    event: "municipality.law.open",
    description: "Abrió una ley desde la página de un departamento. Propiedad law.",
    tags: ["municipios", "leyes"],
  },
  {
    event: "municipality.transparency_item.open",
    description:
      "Abrió el detalle de una de las cosas que un municipio debería publicar (presupuesto, deuda, compras…). Propiedades item y status.",
    tags: ["municipios", "transparencia"],
  },
  {
    event: "municipality.transparency_source.open",
    description: "Abrió en el sitio del municipio el documento de una de las cosas que publica. Propiedad item.",
    tags: ["municipios", "transparencia"],
  },
  {
    event: "municipality.transparency_request.open",
    description: "Desde el detalle de uno de los 9 datos de un municipio, fue a armar la nota para pedirlo (/pedir). Propiedad item.",
    tags: ["municipios", "transparencia", "embudo de pedidos"],
  },
  {
    event: "municipality.poster.open",
    description: "Desde «Qué publica el municipio», fue a hacer un cartel con sus datos (/cartel). Propiedad municipality.",
    tags: ["municipios", "carteles"],
  },
  {
    event: "municipality.budget.open",
    description: "Desde la página de un municipio, abrió su presupuesto (en qué se gasta). Propiedad municipality.",
    tags: ["municipios", "presupuesto"],
  },
  {
    event: "municipality.budget.year.change",
    description: "En el presupuesto de un municipio, cambió de año. Propiedades value (el año) y label.",
    tags: ["municipios", "presupuesto"],
  },
  {
    event: "municipality.budget_source.open",
    description: "En el presupuesto de un municipio, abrió un anexo original de la Ley de Responsabilidad Fiscal. Propiedad municipality.",
    tags: ["municipios", "presupuesto"],
  },
  {
    event: "municipality.staff_source.open",
    description: "Abrió el anexo de personal publicado por un municipio (Ley de Responsabilidad Fiscal).",
    tags: ["municipios"],
  },
  {
    event: "participation.form.change",
    description: "En «Participá», eligió qué hacer (error, dato, pedido, foto) o el paso del pedido (pedido, respuesta). Propiedad value.",
    tags: ["participación"],
  },
  {
    event: "participation.form.start",
    description:
      "En «Participá», tocó por primera vez un campo de un formulario. Propiedad form (request, answer, bug, data_suggestion, photo).",
    tags: ["participación"],
  },
  {
    event: "participation.form.invalid",
    description:
      "En «Participá», tocó Enviar pero el navegador lo frenó por un campo obligatorio vacío o mal escrito. Propiedades form y field (el nombre del campo, nunca lo escrito).",
    tags: ["participación"],
  },
  {
    event: "participation.item_picker.open",
    description: "Abrió la lista de «Qué dato pediste» al registrar un pedido.",
    tags: ["participación"],
  },
  {
    event: "participation.item_picker.select",
    description: "Eligió un dato en «Qué dato pediste». Propiedad item (id del dato que no se publica, u otro).",
    tags: ["participación"],
  },
  {
    event: "participation.request.how_to",
    description: "Tocó «¿Todavía no lo pediste? Mirá cómo pedirlo» en el formulario del pedido.",
    tags: ["participación"],
  },
  {
    event: "participation.done.again",
    description: "Después de un envío, tocó el botón para mandar otro. Propiedad form.",
    tags: ["participación"],
  },
  {
    event: "participation.done.missing_data",
    description: "Después de un envío, fue a «Lo que no se publica». Propiedad form.",
    tags: ["participación"],
  },
  {
    event: "participation.request.success",
    description: "Registró un pedido de acceso a la información con su número de trámite.",
    tags: ["participación", "embudo de pedidos"],
  },
  {
    event: "participation.request.error",
    description: "Falló el registro de un pedido (dato inválido, trámite repetido o sin conexión). Propiedad status: código de respuesta.",
    tags: ["participación"],
  },
  {
    event: "participation.answer.success",
    description: "Contó qué le respondió el Estado a un pedido registrado.",
    tags: ["participación"],
  },
  {
    event: "participation.answer.error",
    description: "Falló el envío de una respuesta (por ejemplo, número de trámite no registrado). Propiedad status.",
    tags: ["participación"],
  },
  {
    event: "participation.bug.success",
    description:
      "Reportó un error del sitio. Propiedad type: dato_incorrecto, dato_desactualizado, falta_dato, link_roto, se_ve_mal u otro.",
    tags: ["participación"],
  },
  { event: "participation.bug.error", description: "Falló el envío de un reporte de error. Propiedad status.", tags: ["participación"] },
  { event: "participation.data_suggestion.success", description: "Sugirió un dato para sumar al sitio.", tags: ["participación"] },
  {
    event: "participation.data_suggestion.error",
    description: "Falló el envío de una sugerencia. Propiedad status.",
    tags: ["participación"],
  },
  {
    event: "pedido-registrar.click",
    description: "Tocó «Registrar pedido» en «Participá» (antes de saber si el envío funcionó).",
    tags: ["participación"],
  },
  { event: "respuesta-enviar.click", description: "Tocó «Enviar respuesta» en «Participá».", tags: ["participación"] },
  { event: "error-enviar.click", description: "Tocó «Enviar» en el formulario de errores.", tags: ["participación"] },
  { event: "dato-enviar.click", description: "Tocó «Enviar» en el formulario de sugerencias de datos.", tags: ["participación"] },
  { event: "foto-enviar.click", description: "Tocó «Enviar foto» en el formulario de fotos.", tags: ["participación"] },
  { event: "participation.photo.success", description: "Propuso una foto de paisaje para el sitio.", tags: ["participación"] },
  {
    event: "participation.photo.error",
    description: "Falló el envío de una foto propuesta. Propiedad status.",
    tags: ["participación"],
  },
  {
    event: "participation.answer.toggle_key",
    description: "En «Contar la respuesta», cambió entre usar el código y la clave o el número de trámite.",
    tags: ["participación"],
  },
  {
    event: "participation.credentials.copy",
    description: "Copió el código o la clave que recibió al registrar un pedido o enviar un reporte.",
    tags: ["participación"],
  },
  {
    event: "search.open",
    description: "Abrió el buscador. Propiedad source: desde dónde (portada, lupa del header, teclado, guía).",
    tags: ["búsqueda"],
  },
  {
    event: "search.select",
    description:
      "Eligió un resultado del buscador. Propiedades query, kind (ley, funcionario, municipio…), path, position, filter y source (desde dónde se abrió el buscador, desde el 18/10/2026).",
    tags: ["búsqueda"],
  },
  {
    event: "search.no_results",
    description:
      "Buscó algo y no encontró nada. Propiedades query (sirve para saber qué contenido falta) y source (desde dónde se abrió el buscador, desde el 18/10/2026).",
    tags: ["búsqueda"],
  },
  {
    event: "search.filter",
    description: "Filtró los resultados del buscador por tipo (funcionarios, leyes, proveedores…). Propiedad kind.",
    tags: ["búsqueda"],
  },
  { event: "search.example", description: "Tocó una búsqueda de ejemplo en el buscador vacío. Propiedad query.", tags: ["búsqueda"] },
  { event: "search.shortcut", description: "Fue a una sección desde los accesos del buscador vacío. Propiedad to.", tags: ["búsqueda"] },
  {
    event: "search.no_results_link",
    description: "Tocó un camino sugerido cuando el buscador no encontró nada (ver funcionarios, contanos qué falta). Propiedad to.",
    tags: ["búsqueda"],
  },
  { event: "search.close", description: "Cerró el buscador sin elegir un resultado.", tags: ["búsqueda"] },
  {
    event: "home.department.select",
    description:
      "Eligió su departamento en «Elegí tu departamento», en el hero de la portada (antes «¿Dónde vivís?»). Propiedad municipality.",
    tags: ["portada"],
  },
  {
    event: "home.question.open",
    description:
      "Tocó una de las preguntas de la portada. Propiedades question y place: hero (los tres accesos del hero, desde el 18/10/2026) o list («Empezá por una pregunta»; sin place antes de esa fecha).",
    tags: ["portada"],
  },
  {
    event: "home.news.open",
    description: "Abrió una novedad de «Lo nuevo». Propiedad kind (ley, Boletín, deuda, personal).",
    tags: ["portada"],
  },
  { event: "home.map.open", description: "Abrió una sección desde «Todo lo que hay». Propiedad section.", tags: ["portada"] },
  { event: "home.reading_guide.open", description: "Abrió la guía «Cómo leer estos datos» desde la portada.", tags: ["portada"] },
  {
    event: "home.figure.open",
    description:
      "Abrió una cifra de «Mendoza en números» (tarjeta, fila del celular, inflación o dólar). Propiedad figure (deuda, coparticipacion, compras-ocds, inflacion…).",
    tags: ["portada"],
  },
  { event: "home.signals.open", description: "Tocó «Ver todas las señales y sus casos» en «Para mirar de cerca».", tags: ["portada"] },
  {
    event: "home.missing_data.open",
    description: "Abrió un dato de «Lo que el Estado no publica» desde la portada. Propiedad item.",
    tags: ["portada"],
  },
  {
    event: "home.map_department.open",
    description: "Tocó un departamento en el mapa de «Tu departamento». Propiedad municipality.",
    tags: ["portada"],
  },
  {
    event: "landscape.credit",
    description:
      "Tocó el botón de autoría (i) sobre una foto de paisaje y vio el crédito. Propiedad photo. Antes del 18/10/2026 era el link del crédito bajo la foto.",
    tags: ["portada"],
  },
  {
    event: "landscape.credit_source",
    description: "Desde la autoría de una foto de paisaje, abrió la foto original y su licencia. Propiedad photo.",
    tags: ["portada"],
  },
  { event: "landscape.propose", description: "Tocó «Proponé tu foto» sobre una foto de paisaje. Propiedad photo.", tags: ["portada"] },

  // Retired: the site no longer sends these, but PostHog keeps their history. Described so it can still be read.
  {
    event: "municipality.index.open",
    description:
      "Ya no se envía. Abría un índice de transparencia de otra organización (Municipios Argentinos, IERAL) desde un municipio; se quitaron el 16/10/2026.",
    tags: ["en desuso"],
  },
  {
    event: "home.hero.reading_guide",
    description: "Ya no se envía. Tocaba «¿Primera vez? Empezá por acá» en la portada; se quitó el 17/10/2026 (1 clic en 6 días).",
    tags: ["en desuso"],
  },
  {
    event: "home.search.select",
    description: "Ya no se envía. Elegía un resultado del buscador anterior de la portada; hoy lo cubre search.select.",
    tags: ["en desuso"],
  },
  {
    event: "home.search.no_results",
    description: "Ya no se envía. Búsqueda sin resultados en el buscador anterior de la portada; hoy lo cubre search.no_results.",
    tags: ["en desuso"],
  },
];
