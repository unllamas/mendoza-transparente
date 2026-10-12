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
  tipo?: "texto" | "numero" | "moneda" | "fecha" | "anio" | "mes" | "porcentaje" | "booleano";
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
  nombre: string;
  total: number;
  adjudicaciones: number;
  procesos: number;
  primera: string;
  ultima: string;
  organismos: { nombre: string; monto: number; procesos: number }[];
  porAnio: { anio: number; monto: number }[];
  recientes: { ocid: string; fecha: string; titulo: string; comprador: string; metodo: string; monto: number }[];
}
