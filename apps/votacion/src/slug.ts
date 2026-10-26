/** "Luján de Cuyo" → "lujan-de-cuyo". The build and the app use it for file names and URLs. */
export function slug(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "sin-nombre"
  );
}
