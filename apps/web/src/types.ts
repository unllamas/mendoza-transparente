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
  que_es: string;
  por_que_importa: string;
  organismo: string;
  marco_legal: string;
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

export interface Funcionario {
  id: string;
  /** URL: /funcionarios/<role>/<slug> (cargo y nombre). */
  role: string;
  slug: string;
  /** Municipalities this person governs or represents (intendente: one; provincial legislators: their section). */
  municipalities: { slug: string; name: string }[];
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
  } | null;
}

export interface FuncionariosTema {
  personas: Funcionario[];
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

export interface Senal {
  id: string;
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
  intendente: { id: string; role: string; slug: string; nombre: string; partido: string | null; foto: string | null; mandatoHasta: string | null } | null;
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
  legisladores: { id: string; role: string; slug: string; nombre: string; cargo: string; bloque: string | null; foto: string | null }[];
}

export interface OrganismoResumen {
  slug: string;
  nombre: string;
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
  resumen: { texto: string; puntos: string[] } | null;
  bloques: LeyBloque[];
  cierre: LeyCierre | null;
}
