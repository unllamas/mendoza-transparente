export interface SourceMeta {
  id: string;
  nombre: string;
  descripcion: string;
  organismo: string;
  url: string;
  formato: string;
  frecuencia: string;
  dificultad: string;
  estado: string;
  raw: { files: number; bytes: number; lastFetch: string | null };
  /** Copy of the raw files on archive.org, or null until they are uploaded. */
  archiveOrg: string | null;
}

export interface ColumnaDict {
  etiqueta?: string;
  tipo?: "texto" | "numero" | "moneda" | "fecha" | "anio" | "mes" | "porcentaje" | "booleano" | "url";
  descripcion?: string;
  oculta?: boolean;
  moneda?: "ARS" | "USD";
  monedaColumna?: string;
  escala?: number;
  quitarPrefijo?: string;
  unidad?: string;
  /** Traducción de códigos a texto legible ({"active": "En curso"}). */
  valores?: Record<string, string>;
}

/** Diccionario de una tabla: data/processed/<fuente>/<archivo>.meta.json (ver docs/diccionario-de-datos.md). */
export interface Diccionario {
  titulo?: string;
  descripcion?: string;
  columnas?: Record<string, ColumnaDict>;
  orden?: string[];
  /** Columna para separar la tabla en grupos (por ejemplo "provincia"), con un selector en la web. */
  agruparPor?: string;
  /** Grupo que se muestra al entrar (por ejemplo "Mendoza"). */
  grupoInicial?: string;
  /** "ultimo": en vez de la tabla, tarjetas con el dato más reciente. */
  vista?: "tabla" | "ultimo";
}

export interface DatasetMeta {
  source: string;
  file: string;
  columns: string[];
  rowCount: number;
  bytes: number;
  dict: Diccionario | null;
  /** Grupos disponibles si la tabla se agrupa; cada uno tiene su archivo de vista previa. */
  groups: { value: string; slug: string; rowCount: number }[] | null;
  /** Panel de detalle con datos relacionados: perfil del proveedor o adjudicaciones del proceso. */
  detalle: "proveedor" | "proceso" | null;
}

export interface DataIndex {
  generatedAt: string;
  sources: SourceMeta[];
  datasets: DatasetMeta[];
}

/** public/data/fuentes.json: the sources without the datasets, for the footer, the home and every «Fuentes» section. */
export interface SourceCatalog {
  generatedAt: string;
  sources: SourceMeta[];
  /** Rows across every published dataset. */
  records: number;
  /** Sources with at least one published dataset. */
  sourcesWithData: number;
}

export interface Preview {
  columns: string[];
  rows: string[][];
}

export interface PuntoSerie {
  fecha: string;
  usd: number;
}

export interface DeudaTema {
  corte: string;
  totalUsd: number;
  porHabitanteUsd: number;
  poblacion: number;
  serie: PuntoSerie[];
  mandatos: {
    gobierno: string;
    desde: string;
    hasta: string | null;
    inicio: PuntoSerie;
    fin: PuntoSerie;
    enCurso: boolean;
  }[];
  porAcreedor: { nombre: string; usd: number }[];
  porMoneda: { nombre: string; usd: number }[];
  instrumentos: {
    instrumento: string;
    acreedor: string;
    moneda: string;
    usd: number;
    tasa: string;
    vencimiento: string;
  }[];
}

export interface EmpleoTema {
  anio: number;
  plantaMendoza: number;
  cadaMilMendoza: number;
  /** Puesto de Mendoza ordenando de menos a más empleados cada mil habitantes. */
  posicion: number;
  promedioPais: number;
  ranking: { provincia: string; cadaMil: number }[];
  serie: { anio: number; cadaMil: number }[];
}

export interface ProcesoDetalle {
  ocid: string;
  fecha: string;
  comprador: string;
  titulo: string;
  metodo: string;
  estado: string;
  montoEstimado: number | null;
  oferentes: number | null;
  adjudicaciones: { proveedor: string; cuit: string; monto: number }[];
}

export interface ProveedorDetalle {
  cuit: string;
  /** Datos del Registro Nacional de Sociedades. Para personas humanas solo se indica el tipo. */
  empresa: {
    tipoPersona: "humana" | "juridica";
    razonSocial: string | null;
    tipoSocietario: string | null;
    fechaConstitucion: string | null;
    localidad: string | null;
    actividad: string | null;
    mesesHastaPrimeraAdjudicacion: number | null;
  } | null;
  nombre: string;
  total: number;
  adjudicaciones: number;
  procesos: number;
  primera: string;
  ultima: string;
  organismos: { nombre: string; monto: number; procesos: number }[];
  /** Monto nominal y en pesos de hoy (referenciaReal) por año, incluidos los años sin adjudicaciones. */
  porAnio: { anio: number; monto: number; real: number }[];
  referenciaReal: string | null;
  recientes: { ocid: string; fecha: string; titulo: string; comprador: string; metodo: string; monto: number }[];
}

export interface CoparticipacionTema {
  /** Mes al que están expresados los pesos de hoy ("ago 2026"). */
  referencia: string;
  anioCompleto: number;
  totalReal: number;
  municipios: {
    municipio: string;
    poblacion: number;
    real: number;
    perCapita: number;
    serie: { anio: number; nominal: number; real: number; perCapita: number | null; parcial: boolean }[];
  }[];
  provincia: { anio: number; real: number; perCapita: number | null; parcial: boolean }[];
}

export interface PoblacionTema {
  anioActual: number;
  actual: number;
  censo2010: number;
  censo2022: number;
  serie: { anio: number; poblacion: number; proyectado: boolean }[];
  departamentos: {
    municipio: string;
    censo2010: number;
    censo2022: number;
    /** Variación porcentual entre los censos 2010 y 2022. */
    variacion: number;
    actual: number;
    serie: { anio: number; poblacion: number }[];
  }[];
}

export interface MapaMendoza {
  viewBox: string;
  fuente: string;
  /** Equirectangular projection of the map: x = (lon - minLon) * cosLat * scale, y = (maxLat - lat) * scale. */
  proyeccion?: { minLon: number; maxLat: number; cosLat: number; scale: number };
  departamentos: { municipio: string; path: string; centroide: [number, number] }[];
}

export interface HomeTema {
  deuda?: { totalUsd: number; porHabitanteUsd: number; corte: string; maximo: PuntoSerie; serie: number[] };
  coparticipacion?: {
    totalReal: number;
    anio: number;
    referencia: string;
    top: { municipio: string; perCapita: number };
    serie: number[];
    porMunicipio: Record<string, number>;
  };
  empleo?: { cadaMil: number; promedioPais: number; posicion: number; anio: number; serie: number[] };
  poblacion?: { actual: number; anio: number; variacionCensos: number; serie: number[] };
  compras?: {
    procesos: number;
    proveedores: number;
    totalAdjudicado: number;
    pctDirectas: number;
    pctMontoDirectas: number;
    pctUnaOferta: number;
    desde: string;
    hasta: string;
    serie: number[];
  };
  boletin?: { normas: number; designaciones: number; contrataciones: number; presupuesto: number; desde: string; hasta: string };
  inflacion?: { mensual: number; interanual: number; periodo: string; serie: number[] };
  dolar?: { oficial: number; periodo: string };
}

export interface NoPublicado {
  id: string;
  titulo: string;
  categoria: import("./no-publicado-categories.ts").NoPublicadoCategory;
  que_es: string;
  por_que_importa: string;
  organismo: string;
  marco_legal: string;
  /** Access-to-information law the request goes under: provincial 9070 (default) or national 27.275 (universities, national bodies). */
  ley?: "9070" | "27275";
  /** Where to file it, when it is not the provincial form: a web form or a mailto: link. */
  formulario?: string;
  estado: "sin_publicar" | "parcial" | "desactualizado";
  detalle_estado?: string;
  donde_buscamos: string[];
  pedido: string;
  pedidos: { fecha: string; tramite?: string; estado: "presentado" | "respondido" | "vencido" | "denegado"; respuesta_url?: string }[];
}

export type GrupoFuncionario =
  | "ejecutivo"
  | "intendentes"
  | "diputados_provincial"
  | "senado_provincial"
  | "diputados_nacional"
  | "senado_nacional";

/** A party, front or legislative bloc, under one name however the sources write it (data/curado/partidos.yaml). */
export interface PartyRef {
  /** URL: /partidos/<slug>. */
  slug: string;
  name: string;
  /** The acronym, or the initials of the name: for titles and search, never on the badge. */
  short: string;
  /** Logo from an official source (/partidos/<file>), or null while there is none. */
  logo: string | null;
  /** The party's official color ("#951b81"), from its logo or its column on the ballot; null when there is no official one. */
  color: string | null;
}

export interface Funcionario {
  id: string;
  /** URL: /funcionarios/<role>/<slug> (cargo y nombre). */
  role: string;
  slug: string;
  /** Municipalities this person governs or represents (intendente: one; provincial legislators: their section). */
  municipalities: { slug: string; name: string }[];
  /** Agency this person leads or belongs to (/gobierno/<slug>), for Executive officials. */
  agency?: { slug: string; name: string };
  nombre: string;
  /** Aclaración publicada junto al nombre (suspensión, licencia). */
  nota: string | null;
  /** Miniatura de la foto oficial y organismo que la publica. */
  foto: string | null;
  fotoCredito: string | null;
  cargo: string;
  grupo: GrupoFuncionario;
  organismo: string;
  partido: string | null;
  bloque: string | null;
  /** What the badge on the face shows: the bloc for legislators, the party or front for the rest. Null for appointed positions. */
  party: PartyRef | null;
  /** Elected, but the official source does not say the party (never inferred). */
  partyMissing: boolean;
  seccion: string | null;
  mandatoDesde: string | null;
  mandatoHasta: string | null;
  email: string | null;
  perfilUrl: string | null;
  fuenteUrl: string;
  /** Solo remuneraciones publicadas oficialmente; vacío si no hay fuente. */
  remuneracion: { concepto: string; monto: number; periodo: string; fuenteUrl: string }[];
  /** Última declaración jurada publicada por la Oficina de Ética Pública, si se pudo cruzar con certeza. */
  ddjj: {
    fecha: string | null;
    periodo: string | null;
    /** Suma de valuaciones fiscales de inmuebles y rodados, según el porcentaje propio. */
    totalBienes: number;
    inmuebles: number;
    rodados: number;
    cargoDeclarado: string | null;
    reparticion: string | null;
    declaracionesPublicadas: number;
    /** Items the declaration includes but whose amounts the official site does not publish ("cuentas bancarias"…). */
    declaredWithoutAmount: string[];
  } | null;
  /** Positions this person held before, from the Ética Pública registry (only ended ones). */
  pastPositions?: PastPosition[];
  /** Elections this person won, from the Junta Electoral proclamation records. */
  elected?: ElectedRecord[];
}

/** A position registered in the Ética Pública registry, with its dates (YYYY-MM-DD, null when unknown). */
export interface PastPosition {
  role: string;
  agency: string;
  from: string | null;
  to: string | null;
}

/** An election this person won, as the Junta Electoral proclamation record says. */
export interface ElectedRecord {
  /** Election date (YYYY-MM-DD). */
  date: string;
  role: string;
  /** Province, municipality or electoral section. */
  place: string;
  /** Party, front or list as the record says (under its normalized name); null if the record does not say. */
  party: string | null;
  /** /partidos/<slug> of that party; null if the record does not say. */
  partySlug: string | null;
  sourceUrl: string;
}

/** Someone who held a public position in Mendoza and no longer does (or whose past we know). */
export interface HistoryPerson {
  /** "etica-<official_id>" or "electo-<slug>": the ?persona= value. */
  id: string;
  name: string;
  /** Latest known position and where. */
  role: string;
  agency: string;
  /** Years of that latest position. */
  from: string | null;
  to: string | null;
  positions: PastPosition[];
  elected: ElectedRecord[];
  /** Party of the latest election this person won; null if they were never elected. */
  party: PartyRef | null;
  /** Won an election, but the record does not say the party. */
  partyMissing: boolean;
}

/** How the elected positions of one election were split among parties. */
export interface ElectionSummary {
  date: string;
  year: number;
  /** href: the person's page if they hold a current position, else their sheet in /funcionarios/historial. */
  governor: { name: string; party: string | null; partySlug: string | null; href: string } | null;
  /** `slug` is null for "No lo dice el acta". */
  offices: { key: string; label: string; total: number; parties: { nombre: string; valor: number; slug: string | null }[] }[];
  sourceUrl: string;
}

export interface HistoryTema {
  people: HistoryPerson[];
  elections: ElectionSummary[];
  /** Ex officials (people whose positions all ended). */
  formerCount: number;
}

export interface FuncionariosTema {
  personas: Funcionario[];
  /** Latest official exchange rate (monthly average), to show declared assets in dollars as a reference. */
  usd?: { rate: number; month: string };
}

export interface Caso {
  tipo: "proceso" | "proveedor";
  /** ocid del proceso o CUIT del proveedor: abre su detalle. */
  id: string;
  titulo: string;
  detalle: string;
  monto: number | null;
  fecha: string | null;
}

/** Block of /senales where a signal goes; also the section id (`/senales#precios`). */
export type SignalGroup = "datos" | "competencia" | "precios" | "proveedores";

export interface Senal {
  id: string;
  group: SignalGroup;
  /** Title of its block ("Cuánto se paga"). */
  tema: string;
  cifra: string;
  titulo: string;
  matiz: string;
  porQueImporta: string;
  metodo: string;
  casosTitulo: string;
  casos: Caso[];
  /** id de «Lo que el Estado no publica» relacionado, si corresponde. */
  pedido?: string;
}

export interface SenalesTema {
  generado: string;
  senales: Senal[];
}

export interface MunicipioPagina {
  slug: string;
  nombre: string;
  intendente: {
    id: string;
    role: string;
    slug: string;
    nombre: string;
    partido: string | null;
    party: PartyRef | null;
    foto: string | null;
    mandatoHasta: string | null;
  } | null;
  poblacion: {
    actual: number;
    censo2010: number;
    censo2022: number;
    variacion: number;
    /** Puesto entre los 18 por cantidad de habitantes. */
    puesto: number;
    serie: { anio: number; poblacion: number }[];
  };
  coparticipacion: {
    anio: number;
    referencia: string;
    perCapita: number;
    real: number;
    /** Puesto entre los 18 por coparticipación por habitante. */
    puesto: number;
    serie: { anio: number; perCapita: number }[];
  } | null;
  seccion: string | null;
  legisladores: {
    id: string;
    role: string;
    slug: string;
    nombre: string;
    cargo: string;
    bloque: string | null;
    party: PartyRef | null;
    foto: string | null;
  }[];
  /** Municipal staff from the Fiscal Responsibility Law, Annex 19 (null when the municipality does not publish it). */
  staff: MunicipalStaff | null;
  /** What the municipality publishes, checked by hand on its site (data/curado/transparencia-municipal.yaml). */
  transparency: MunicipalTransparency | null;
  /** Budget from the Fiscal Responsibility Law annexes; absent while the municipality is not read yet. */
  budget?: MunicipalBudgetSummary;
  /** Procedure and fee pages of the municipality (scripts/temas/procedures.ts); absent while it has none. */
  commerce?: { procedure: boolean; feesYear: number | null };
}

/** Short budget summary for the municipality's main page (scripts/temas/municipal-budget.ts). */
export interface MunicipalBudgetSummary {
  year: number;
  partial: boolean;
  /** "diciembre de 2025": the end of the last quarter published for the year. */
  cutoff: string;
  accrued: number;
  current: number;
  perCapitaReal: number | null;
  /** Month the "pesos de hoy" refer to ("ago 2026"). */
  reference: string | null;
  /** Years with a budget page, latest first. */
  years: number[];
}

/** Budget of a municipality, every year (temas/municipios/<slug>/presupuesto.json). Nominal pesos unless it says real. */
export interface MunicipalBudget {
  slug: string;
  name: string;
  reference: string | null;
  /** Latest first. */
  years: MunicipalBudgetYear[];
}

export interface MunicipalBudgetYear {
  year: number;
  /** Last quarter published for the year; the figures accumulate from January to its end. */
  quarter: number;
  /** The figures do not cover the whole year: the year is still going, or its last report is missing. */
  partial: boolean;
  /** The year ended but its December report was not published or could not be read (Tupungato 2024). */
  missingClose: boolean;
  cutoff: string;
  /** Approved in the original budget (crédito votado). */
  voted: number;
  /** Authorized after changes (crédito vigente). */
  current: number;
  /** Spent: goods and services received (devengado). */
  accrued: number;
  paid: number;
  accruedReal: number;
  perCapitaReal: number | null;
  /** By object of expenditure, common to every municipality; largest spending first. */
  byObject: { name: string; accrued: number; current: number; voted: number }[];
  /** By area of government, only when the municipality breaks spending down (San Rafael). */
  byArea: { name: string; accrued: number; current: number }[] | null;
  revenue: {
    estimated: number;
    collected: number;
    byKind: { kind: string; collected: number; estimated: number }[];
    /** Largest revenue items collected, without financing. */
    top: { name: string; collected: number }[];
  } | null;
  debt: {
    /**
     * "loans": the annex lists loans. "short_term": it lists short-term liabilities instead (third-party funds,
     * withholdings, bank overdrafts), shown as "Deudas de corto plazo" and not comparable with loans.
     */
    kind: "loans" | "short_term";
    quarter: number;
    balance: number;
    paidInYear: number;
    newInYear: number;
    loans: { name: string; balance: number }[];
  } | null;
  sources: { spending: string | null; revenue: string | null; debt: string | null };
}

/** Key of each thing the law asks a municipality to publish (docs/procesos/metodologia.md#transparencia-municipal). */
export type TransparencyItemId =
  | "presupuesto"
  | "ejecucion"
  | "personal"
  | "deuda"
  | "compras"
  | "normas"
  | "sueldos"
  | "declaraciones_juradas"
  | "acceso_informacion";

/**
 * current: published and up to date; late: published but behind; undated: published, but its latest date cannot be
 * seen (a search app); unreadable: exists but cannot be downloaded or read.
 */
export type TransparencyStatus = "current" | "late" | "undated" | "unreadable" | "missing";

export interface TransparencyItem {
  id: TransparencyItemId;
  status: TransparencyStatus;
  /** Period of the latest data (ISO date): a quarter's cut-off, a budget's year, the date of the latest tender. */
  latest: string | null;
  format: "planilla" | "pdf" | "pdf_escaneado" | "web" | "zip" | null;
  url: string | null;
  note: string | null;
}

export interface MunicipalTransparency {
  /** Day the site was checked. */
  checked: string;
  site: string | null;
  items: TransparencyItem[];
  /** Items published (current, late or undated) and items up to date, out of items.length. */
  published: number;
  current: number;
  /** Place among the 18 by items published (1 = most; ties share it) and the average of the 18. */
  rank: number;
  average: number;
  searched: string[];
  note: string | null;
}

/** Net change in positions (planta) against the previous published quarter, not always the one right before. */
export interface QuarterlyChange {
  period: string; // "2026-T2"
  previous: string;
  change: number;
}

export interface MunicipalStaff {
  /** Latest quarter published ("2.º trimestre de 2026") and its cut-off date. */
  quarter: string;
  cutoff: string;
  permanent: number;
  temporary: number;
  /** Permanent + temporary positions, as the annex totals them. */
  positions: number;
  /** Service contracts (locación): people who work for the municipality without a position. */
  contracts: number;
  /** Positions + contracts per 1,000 inhabitants, and its place among the municipalities with data (1 = most). */
  perThousand: number;
  rank: number;
  withData: number;
  series: { label: string; cutoff: string; positions: number; contracts: number }[];
  quarterlyChange: QuarterlyChange[];
  sourceUrl: string;
  /** Caveat written by the scraper for the latest quarter (a file repeated by the municipality, totals that do not add up). */
  note: string | null;
}

export interface OrganismoResumen {
  slug: string;
  nombre: string;
  /** Buyer name as it comes from COMPR.AR, with its budget code ("1-08-75 - …"). */
  buyer: string;
  procesos: number;
  total: number;
  pctDirecta: number;
  pctUnaOferta: number;
  proveedorPrincipal: { nombre: string; pct: number } | null;
}

export interface OrganismoDetalle extends OrganismoResumen {
  referenciaReal: string | null;
  porAnio: { anio: number; monto: number; real: number }[];
  proveedores: { cuit: string; nombre: string; monto: number; procesos: number; slug: string | null }[];
  recientes: { ocid: string; titulo: string; fecha: string | null; metodo: string; estado: string; monto: number | null }[];
}

export interface ProveedorResumen {
  slug: string;
  cuit: string;
  nombre: string;
  total: number;
  procesos: number;
  primera: string | null;
  ultima: string | null;
  tipoSocietario: string | null;
  localidad: string | null;
  actividad: string | null;
  /** Supera el umbral de contenido: tiene página propia indexable. */
  indexable: boolean;
}

export interface LeyResumen {
  numero: string;
  /** Título en lenguaje simple (curado) o, si no hay, el nombre de la ley o su primer artículo. */
  titulo: string;
  /** Tema corto: "Expropiación", "Convenio", "Salud"… (solo si tiene resumen). */
  tema: string | null;
  /** Fecha de sanción o de la norma, y fecha de publicación en el Boletín. */
  fecha: string | null;
  publicada: string | null;
  boletin: string | null;
  urlPdf: string | null;
  /** Departments where the law does something concrete (slugs of /municipios). */
  municipios: string[];
}

export type LeyBloque =
  | { tipo: "seccion"; texto: string }
  | { tipo: "articulo"; numero: string; titulo?: string; parrafos: string[] }
  | { tipo: "parrafo"; texto: string };

export interface LeyCierre {
  /** "Dada en el recinto de sesiones…, a los ocho días del mes de septiembre…" */
  dada: string;
  firmantes: string[];
}

export interface LeyDetalle extends LeyResumen {
  /** Nombre que se da la propia ley, si lo tiene. */
  encabezado: string | null;
  /** Resumen en lenguaje simple, hecho con IA a partir del texto oficial (data/curado/leyes.yaml). */
  resumen: {
    texto: string;
    /** A quién le toca ("Vecinos de Junín", "Toda la provincia"). */
    aQuien: string | null;
    puntos: string[];
    /** Lo que un vecino querría saber y el texto publicado no dice (anexos sin publicar, montos…). */
    noDice: string[];
    /** Date it was checked by hand against the official text, if it was. */
    revisado: string | null;
  } | null;
  /** Departments with name, for the chips that link to their page. */
  places: { slug: string; name: string }[];
  bloques: LeyBloque[];
  cierre: LeyCierre | null;
  /** Who signed it, with photo and page when they are officials. */
  signers: { name: string; photo: string | null; path: string | null }[];
}

// ------------------------------------------------------------------ Gobierno por dentro (/gobierno)

export type AgencyKind = "ministerio" | "secretaria" | "organismo_control" | "ente_descentralizado" | "empresa" | "poder" | "otro";

export interface AgencySummary {
  slug: string;
  name: string;
  kind: string;
  parent: { slug: string; name: string } | null;
  /** Latest staff count (cargos de planta permanente + temporaria) and quarter it refers to. */
  staff: number | null;
  staffPeriod: string | null;
  /** Personnel cost of the last complete year, in pesos of `realReference`. */
  annualCostReal: number | null;
  head: { name: string; role: string; path: string | null; photo: string | null } | null;
}

export interface AgencyDetail extends AgencySummary {
  whatItDoes: string | null;
  points: string[];
  law: string | null;
  lawUrl: string | null;
  site: string | null;
  note: string | null;
  before: string[];
  children: { slug: string; name: string }[];
  realReference: string | null;
  staffSeries: {
    period: string; // "2026-T2"
    permanent: number;
    temporary: number;
    contracts: number;
    teachingHours: number;
  }[];
  quarterlyChange: QuarterlyChange[];
  costByYear: { year: number; nominal: number; real: number; complete: boolean }[];
  /** Monthly cost per position in the last complete year, in real pesos. */
  monthlyCostPerPosition: number | null;
  /** Sub-units reported separately in the annex (hospitals, DGE…). */
  units: { name: string; staff: number; contracts: number }[];
  /** People with a declaration obligation at Ética Pública, active, ranked by hierarchy. */
  team: { name: string; role: string; since: string | null; path: string | null; photo: string | null }[];
  teamTotal: number;
  purchases: {
    processes: number;
    total: number;
    direct: number;
    singleBid: number;
    topSuppliers: { name: string; amount: number; slug: string | null }[];
    buyers: { slug: string; name: string; processes: number }[];
  } | null;
  appointments: { date: string; action: string; person: string; role: string; unit: string; url: string; photo: string | null }[];
  /** Occupied positions in each year's budget law (planilla 8.2) and unfilled ones (8.6, since 2022). */
  budget: { year: number; positions: number; vacancies: number | null; project: boolean }[];
}

export interface GobiernoOverview {
  /** Total positions (planta) and service contracts per quarter, whole provincial State. */
  series: { period: string; date: string; staff: number; contracts: number }[];
  quarterlyChange: QuarterlyChange[];
  /** Quarter used as the start of the current administration. */
  baseline: string;
  changes: { slug: string; name: string; from: number; to: number; pct: number; restructured: boolean }[];
  contractShare: { slug: string; name: string; contracts: number; staff: number; ratio: number }[];
}

// ------------------------------------------------------------------ Home guide and search

export interface GuideFact {
  figure: string;
  text: string;
}

export interface HomeGuide {
  counts: {
    records: number;
    sources: number;
    officials: number;
    agencies: number;
    laws: number;
    suppliers: number;
    buyers: number;
    municipalities: number;
    missing: number;
    appointments: number;
  };
  /** One line per starting question: the figure (in bold) and a short text after it. */
  facts: { debt: GuideFact | null; latestLaw: string | null; staff: GuideFact | null };
  /** What is new, dated by the data itself. */
  news: { date: string; kind: string; title: string; href: string }[];
}

/** One page in data/search.json (short keys: the file is downloaded on first search). */
export interface SearchEntry {
  /** Path. */
  p: string;
  /** Kind: "Ley", "Funcionario", "Municipio"… (the results are grouped by it). */
  k: string;
  /** Short name. */
  t: string;
  /** One line with what matters for this kind (never the name again). */
  s: string;
  /** Photo, for people (and municipalities, their mayor's). */
  i?: string;
  /** Extra text to match against, not shown (party, CUIT, description). */
  q?: string;
}

export interface RecaudacionTema {
  /** Mes al que están expresados los pesos de hoy ("sep 2026"). */
  referencia: string;
  /** Latest year with data and its last month (1-12). */
  anio: number;
  hastaMes: number;
  /** Months covered ("ene–sep"), the same for every year so they can be compared. */
  periodo: string;
  /** Same months of each of the last years, in today's pesos (at most 8, the last one is `anio`). */
  serie: { anio: number; real: number }[];
  total: { actual: number; anterior: number };
  perCapita: number;
  poblacion: number;
  /** By tax for the same months of `anio` and of the previous year, largest first. */
  porImpuesto: { id: string; nombre: string; actual: number; anterior: number }[];
  /** What the province collected against what Nación sent it automatically, same months of `anio`. */
  frenteANacion: { propios: number; nacion: number } | null;
}

export interface UniversidadesTema {
  referencia: string;
  /** Current year of the national budget, up to its cut-off date. */
  enCurso: {
    anio: number;
    corte: string;
    presupuestado: number;
    devengado: number;
    /** Last full year received, to compare with what is budgeted for the current one. */
    anterior: { anio: number; real: number };
    destino: { nombre: string; real: number }[];
  };
  /** Tesoro nacional transfers to the UNCuyo (devengado), last full years (at most 8), in today's pesos. */
  transferencias: { anio: number; real: number; nominal: number }[];
  /** UNCuyo undergraduate students and graduates, last years of the Anuario (at most 8). */
  estudiantes: { anio: number; estudiantes: number; nuevos: number; egresados: number; posgrado: number | null }[];
  /** Transfers divided by undergraduate and graduate students, per year, in today's pesos. */
  porEstudiante: { anio: number; real: number }[];
  personal: {
    anio: number;
    docentes: { cargos: number; personas: number };
    dedicacion: { id: string; nombre: string; cargos: number }[];
    noDocentes: { cargos: number; personas: number };
    preuniversitario: { cargos: number; personas: number };
    autoridades: number;
  } | null;
  /** UNCuyo students by discipline (groups of similar degrees), latest year of the Anuario, largest first. */
  disciplinas: {
    anio: number;
    items: { disciplina: string; rama: string; estudiantes: number; nuevos: number; egresados: number }[];
  } | null;
  /** Passed subjects in the year, latest year of the Anuario, in percent. */
  rendimiento: { anio: number; nuevosSinMaterias: number; reinscriptosDosOMas: number; reinscriptosSinMaterias: number } | null;
  /** UTN figures for the whole country (they cannot be split for Mendoza). */
  utn: { anioEstudiantes: number; estudiantes: number; anio: number; presupuestado: number } | null;
}

/** A person in office, as listed on a party page. */
export interface PartyMember {
  id: string;
  role: string;
  slug: string;
  name: string;
  photo: string | null;
  /** Where: the municipality, the electoral section or the chamber. */
  place: string;
  /** The name exactly as this person's source writes it ("UCR-Cambia Mendoza"). */
  asWritten: string;
  /** Whether that name is the person's bloc or their party or front. */
  via: "bloque" | "partido";
  mandateTo: string | null;
}

/** One row of /partidos. */
export interface PartySummary extends PartyRef {
  /** People in office today under this name. */
  inOffice: number;
  /** Seats won as titular in the elections since 2015 (Junta Electoral records). */
  seatsWon: number;
  /** Year of the latest election it won a seat in, or null. */
  lastElection: number | null;
  /** How the sources use the name: as a party or front, as a legislative bloc, or both. */
  uses: ("partido" | "bloque")[];
}

/** /partidos/<slug>: who holds office under this name and what it won in each election. */
export interface PartyDetail extends PartySummary {
  /** Every way the sources write the name, other than `name`, with why it counts as the same one. */
  aliases: { name: string; reason: string }[];
  logoSource: string | null;
  wikidata: string | null;
  members: { group: GrupoFuncionario; people: PartyMember[] }[];
  elections: { date: string; year: number; offices: { label: string; count: number }[]; sourceUrl: string }[];
  /** People elected under this name who hold no current position, with their sheet in /funcionarios/historial. */
  former: { id: string; name: string; role: string; place: string; year: number }[];
}

/** Who a request letter can go to, with what it can ask for (temas/pedir.json, built by scripts/temas/civic-tools.ts). */
export interface RequestTarget {
  /** "muni-guaymallen" or "org-<slug of the body>": the ?para= of /pedir. */
  id: string;
  label: string;
  group: "Municipios" | "Gobierno de Mendoza";
  municipal: boolean;
  /** City in the letter's date line. */
  city: string;
  /** Where to file it, as the end of "Presentala …". */
  where: string;
  /** Official online form or channel, when there is one. */
  formUrl: string | null;
  documents: RequestDocument[];
}

export interface RequestDocument {
  /** A transparency item for a municipality, a no-publicado.yaml id for the provincial bodies: the ?dato= of /pedir. */
  id: string;
  label: string;
  /** The point of the letter. */
  text: string;
  /** Not published or not readable: chosen by default. */
  missing: boolean;
  /** "No lo publica", "No se puede leer", "Lo publica" (municipalities only). */
  status: string | null;
}

/** What a poster about a municipality can show (temas/carteles.json, built by scripts/temas/civic-tools.ts). */
export interface PosterMunicipality {
  slug: string;
  name: string;
  checked: string;
  site: string | null;
  items: { id: TransparencyItemId; status: TransparencyStatus; format: TransparencyItem["format"]; url: string | null }[];
  published: number;
  coparticipation: { year: number; reference: string; total: number; perCapita: number } | null;
  staff: { quarter: string; positions: number; contracts: number; perThousand: number } | null;
  /** Spending of the latest year read, with the four largest objects. */
  spending: { year: number; cutoff: string; accrued: number; top: { name: string; accrued: number }[] } | null;
}

// ---------------------------------------------------------------- trámites (scripts/temas/procedures.ts)

export interface ProcedureStep {
  level: "nacion" | "provincia" | "municipio";
  agency: string;
  title: string;
  detail: string;
  /** Official page or norm the step comes from. */
  href: string;
  /** "siempre", or the condition the activity must meet ("alimentos"). */
  when: string;
  /** Day (YYYY-MM-DD) the step was checked against its official page. */
  verified: string;
}

export interface ProcedureCost {
  concept: string;
  detail: string;
  rule?: string;
  href?: string;
}

/** Something an organism does not publish ("<agency> no publica <what>"). */
export interface NotPublished {
  agency: string;
  what: string;
  detail?: string;
}

export interface ProcedureFee {
  /** False when the published rules do not allow giving an amount (San Rafael). */
  available: boolean;
  /** The full annex is read: the municipality has a fees page. */
  table: boolean;
  /** "mes", "bimestre", "año", or "" when the ordinance does not say. */
  period: string;
  /** "pesos", "UT" or "UTM". */
  unit: string;
  year: number | null;
  unitValue?: number;
  unitRule?: string;
  rule: string;
  href: string;
  note?: string;
  /** Amounts typed by hand for a few activities, when the annex is a scan nobody can read automatically. */
  examples: { name: string; min: number; max: number; page?: number }[];
}

export interface MunicipalProcedure {
  slug: string;
  name: string;
  verified: string;
  /** Only the steps of the municipality: Nation and Province are on the province page. */
  steps: ProcedureStep[];
  costs: ProcedureCost[];
  fee: ProcedureFee;
  notPublished: NotPublished[];
  promotion: { rule: string; detail: string; href?: string } | null;
}

export type OnlineStatus = "online" | "in_person" | "unknown" | "not_published";

export interface ProcedureGuide {
  id: string;
  title: string;
  verified: string;
  national: ProcedureStep[];
  province: ProcedureStep[];
  provinceNotPublished: NotPublished[];
  municipalities: {
    slug: string;
    name: string;
    verified: string;
    ownSteps: number;
    online: OnlineStatus;
    /** The sentence of the municipality's sheet that says how it starts (or what it does not say). */
    onlineNote: string;
    fee: "table" | "examples" | "none";
    feeYear: number | null;
    feeUnit: string;
    hasPromotion: boolean;
  }[];
}

export interface FeeRow {
  code: string;
  group: string;
  name: string;
  type: string;
  /** Page of the ordinance with its annexes. */
  page: number;
  /** [category, amount in the fee's unit], in the order of the annex. */
  amounts: [string, number][];
}

/** Trade fee by activity of a municipality whose tarifaria annex is read (/municipios/<slug>/tasas). */
export interface MunicipalFees {
  slug: string;
  name: string;
  year: number;
  verified: string;
  period: string;
  unit: string;
  unitValue?: number;
  unitRule?: string;
  rule: string;
  href: string;
  note?: string;
  ordinance: { number: string; bulletinDate: string; href: string };
  categories: string[];
  /** Everyday activities of the catalog, in pesos (min and max among the categories). */
  highlights: { name: string; code: string; min: number; max: number }[];
  rows: FeeRow[];
}
