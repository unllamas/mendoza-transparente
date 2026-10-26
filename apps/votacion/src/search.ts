/** What the year pages keep in the URL, so a link opens exactly the same view. */
export interface YearSearch {
  eleccion?: string;
  escrutinio?: string;
  cargo?: string;
  /** Provincial offices: the department on screen. */
  departamento?: string;
  /** Municipal offices: the municipality on screen. */
  municipio?: string;
  /** The force whose sheet is open (number and name, `forceSlug`). */
  partido?: string;
}

export type SetSearch = (patch: Partial<YearSearch>) => void;
