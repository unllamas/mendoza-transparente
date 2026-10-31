import { RiMenuLine, RiSearchLine } from "@remixicon/react";

/** El encabezado del sitio en el celular. `solid` para las páginas interiores (fondo blanco con línea). */
export function SiteHeader({ solid, logoTouched }: { solid?: boolean; logoTouched?: boolean }) {
  return (
    <header className="mt-header" data-solid={solid || undefined}>
      <span className="mt-logo" data-target="logo" data-cursor="hand" data-touched={logoTouched || undefined}>
        Mendoza Transparente
      </span>
      <span className="mt-iconbtn">
        <RiSearchLine size={20} />
      </span>
      <span className="mt-iconbtn">
        <RiMenuLine size={20} />
      </span>
    </header>
  );
}
