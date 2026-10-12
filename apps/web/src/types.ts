export interface SourceMeta {
  id: string;
  nombre: string;
  organismo: string;
  url: string;
  formato: string;
  frecuencia: string;
  dificultad: string;
  estado: string;
  raw: { files: number; bytes: number; lastFetch: string | null };
}

export interface DatasetMeta {
  source: string;
  file: string;
  columns: string[];
  rowCount: number;
  bytes: number;
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
