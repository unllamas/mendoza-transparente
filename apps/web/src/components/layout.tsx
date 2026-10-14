import { ThemeToggle } from "@mt/ui/components/application/theme/theme-toggle";
import { buttonClassName } from "@mt/ui/components/base/buttons/button";
import { IconButton } from "@mt/ui/components/base/buttons/icon-button";
import { Dialog } from "@mt/ui/components/dialog";
import { cx } from "@mt/ui/lib/cx";
import {
  type RemixiconComponentType,
  RiArchiveLine,
  RiArchiveStackLine,
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiBankLine,
  RiBookOpenLine,
  RiBuilding2Line,
  RiCloseLine,
  RiCoinsLine,
  RiEyeOffLine,
  RiGitBranchLine,
  RiGlobalLine,
  RiGroupLine,
  RiMapPinLine,
  RiMenuLine,
  RiQuillPenLine,
  RiScales3Line,
  RiStore2Line,
  RiTeamLine,
  RiUserLine,
} from "@remixicon/react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { trackPageview } from "@/analytics.ts";
import { usePageMeta } from "@/seo.ts";
import { DetailSheet } from "./detail-sheet.tsx";
import { REPO } from "./official-sources.tsx";
import { ReportErrorBand } from "./report-error.tsx";
import { HeaderSearchButton, SearchDialog } from "./search-dialog.tsx";
import { UiProviders } from "./ui-providers.tsx";

type Item = { to: string; label: string; descripcion: string; icon: RemixiconComponentType };
type Grupo = { label: string; items: Item[] };

/** Navegación: un destino principal y grupos desplegables. */
const PRINCIPALES: { to: string; label: string }[] = [{ to: "/senales", label: "Para mirar de cerca" }];

const GRUPOS: Grupo[] = [
  {
    label: "Gobierno",
    items: [
      { to: "/funcionarios", label: "Funcionarios", descripcion: "Quiénes nos representan y qué declaran", icon: RiUserLine },
      {
        to: "/gobierno",
        label: "Gobierno por dentro",
        descripcion: "Cada organismo: quién lo conduce, cuántos cargos y cuánto cuesta",
        icon: RiBuilding2Line,
      },
      { to: "/leyes", label: "Leyes", descripcion: "Qué dice cada ley, en pocas palabras", icon: RiScales3Line },
    ],
  },
  {
    label: "Datos",
    items: [
      { to: "/deuda", label: "Deuda", descripcion: "Cuánto debe la provincia y a quién", icon: RiBankLine },
      { to: "/coparticipacion", label: "Coparticipación", descripcion: "Cuánto recibe cada municipio", icon: RiCoinsLine },
      { to: "/empleo-publico", label: "Empleo público", descripcion: "Empleados por habitante y por provincia", icon: RiTeamLine },
      { to: "/poblacion", label: "Población", descripcion: "Cuántos somos en cada departamento", icon: RiGroupLine },
      { to: "/municipios", label: "Municipios", descripcion: "Una página por cada uno de los 18", icon: RiMapPinLine },
    ],
  },
  {
    label: "Compras del Estado",
    items: [
      { to: "/proveedores", label: "Proveedores", descripcion: "A quiénes les compra el Gobierno", icon: RiStore2Line },
      { to: "/organismos", label: "Organismos", descripcion: "Quién compra, cuánto y cómo", icon: RiBankLine },
    ],
  },
  {
    label: "Transparencia",
    items: [
      { to: "/no-publicado", label: "Lo que no se publica", descripcion: "Datos que faltan y cómo pedirlos", icon: RiEyeOffLine },
      { to: "/participar", label: "Participá", descripcion: "Registrá tu pedido, reportá un error o sugerí un dato", icon: RiQuillPenLine },
      { to: "/registro", label: "Registro de pedidos", descripcion: "Qué se pidió y cuánto responde el Estado", icon: RiArchiveStackLine },
      { to: "/fuentes", label: "Fuentes", descripcion: "De dónde sale cada dato", icon: RiArchiveLine },
      { to: "/como-leer", label: "Cómo leer estos datos", descripcion: "Para qué sirve, cómo empezar y glosario", icon: RiBookOpenLine },
    ],
  },
];

const AUTOR = {
  nombre: "Jona Llamas",
  web: "https://jonallamas.com",
  x: "https://x.com/unllamas",
};

/** Friend sites listed in the footer. To add one, append it here: the UTM parameters and tracking are added automatically. */
const FRIEND_SITES = [
  { name: "Municipios Argentinos", url: "https://municipiosargentinos.net/" },
  { name: "Datos Hoy", url: "https://www.datoshoy.com/" },
  { name: "Pensiómetro", url: "https://pensiometro.net/" },
];

function withUtm(url: string) {
  const u = new URL(url);
  u.searchParams.set("utm_source", "mendoza-transparente.com");
  u.searchParams.set("utm_medium", "referral");
  u.searchParams.set("utm_campaign", "sitios_amigos");
  return u.href;
}

export function Layout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  usePageMeta(pathname);
  useEffect(() => trackPageview(pathname), [pathname]);
  const [abierto, setAbierto] = useState(false);

  // El menú se cierra al navegar y la página no se desplaza detrás mientras está abierto.
  // biome-ignore lint/correctness/useExhaustiveDependencies: close the menu whenever the route changes.
  useEffect(() => setAbierto(false), [pathname]);

  return (
    <UiProviders>
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-20 border-b border-separator-border bg-background-full/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-5">
            <Link to="/" className="mr-auto text-headline-semibold tracking-tight whitespace-nowrap">
              Mendoza Transparente
            </Link>
            <nav aria-label="Principal" className="hidden items-center gap-1 text-body-regular whitespace-nowrap lg:flex">
              {PRINCIPALES.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={buttonClassName({ variant: "tertiary", className: "[&.active]:text-text-link" })}
                >
                  {item.label}
                </Link>
              ))}
              {GRUPOS.map((g) => (
                <Desplegable key={g.label} grupo={g} pathname={pathname} />
              ))}
            </nav>
            <HeaderSearchButton />
            <IconButton
              icon={RiMenuLine}
              aria-label="Abrir menú"
              onClick={() => setAbierto(true)}
              id="menu-movil-boton"
              data-track="nav.mobile_menu.toggle"
              data-track-open="true"
              className="-mr-1.5 lg:hidden"
            />
          </div>
        </header>

        {/* Fuera del header: su backdrop-blur haría que el panel fijo se mida contra el header y no contra la pantalla. */}
        {abierto && (
          // Full-screen panel with its own top bar: it never depends on the page header, which can scroll away on
          // phones while the page is scroll-locked (sticky stops working when <html> has overflow: hidden).
          <Dialog
            label="Menú"
            onClose={() => setAbierto(false)}
            overlayClassName="z-50 lg:hidden"
            className="inset-0 flex flex-col bg-background-full"
          >
            <div className="flex h-14 shrink-0 items-center gap-6 border-b border-separator-border px-4 sm:px-5">
              <Link to="/" className="mr-auto text-headline-semibold tracking-tight whitespace-nowrap">
                Mendoza Transparente
              </Link>
              <IconButton
                icon={RiCloseLine}
                aria-label="Cerrar menú"
                onClick={() => setAbierto(false)}
                id="menu-movil-cerrar"
                data-track="nav.mobile_menu.close"
                className="-mr-1.5"
              />
            </div>
            <nav id="menu-movil" aria-label="Principal" className="flex flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-4 py-5">
              <div className="flex flex-col">
                {PRINCIPALES.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="flex items-center justify-between min-h-11 border-b border-separator-border py-4 text-title-3-regular text-text-primary [&.active]:font-medium [&.active]:text-text-link"
                  >
                    {item.label}
                    <RiArrowRightSLine className="size-5 text-text-link" aria-hidden />
                  </Link>
                ))}
              </div>
              {GRUPOS.map((g) => (
                <div key={g.label} className="flex flex-col gap-1">
                  <span className="text-caption-1-medium tracking-wide text-text-tertiary uppercase">{g.label}</span>
                  {g.items.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className="flex min-h-11 items-center gap-3 rounded-2lg py-3 text-text-primary [&.active]:text-text-link"
                    >
                      <item.icon className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
                      <span className="flex flex-col">
                        <span className="text-headline-regular">{item.label}</span>
                        <span className="text-body-regular text-text-tertiary">{item.descripcion}</span>
                      </span>
                      <RiArrowRightSLine className="ml-auto size-5 shrink-0 text-text-link" aria-hidden />
                    </Link>
                  ))}
                </div>
              ))}
            </nav>
          </Dialog>
        )}

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-5 sm:py-10">
          <Outlet />
          <SearchDialog />
          <DetailSheet />
        </main>

        <footer className="border-t border-separator-border">
          <ReportErrorBand />
          <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10 sm:px-5 md:flex-row md:justify-between">
            <div className="flex max-w-md flex-col gap-2 text-body-regular">
              <span className="text-body-semibold">Mendoza Transparente</span>
              <p className="text-text-secondary text-pretty">
                Proyecto ciudadano, independiente y apartidario. Cada número enlaza a su fuente oficial y los archivos originales se guardan
                tal cual se descargaron.
              </p>
              <a
                href={REPO}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-fit items-center gap-1.5 text-text-link hover:underline"
              >
                <RiGitBranchLine className="size-4" aria-hidden /> Código y datos abiertos en GitHub
              </a>
              <div className="flex items-center gap-2 pt-4">
                <span className="text-text-tertiary">Tema</span>
                <ThemeToggle appearance="segmented" size="compact" />
              </div>
              <nav aria-label="Sitios amigos" className="flex flex-col gap-1 pt-4">
                <span className="text-text-tertiary">Sitios amigos</span>
                <ul className="flex flex-wrap gap-x-4 gap-y-1">
                  {FRIEND_SITES.map((site) => (
                    <li key={site.url}>
                      <a
                        href={withUtm(site.url)}
                        target="_blank"
                        rel="noopener"
                        data-track="footer.friend_site.open"
                        data-track-site={new URL(site.url).host}
                        className="text-text-link hover:underline"
                      >
                        {site.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>

            <div className="flex max-w-sm flex-col gap-2 text-body-regular">
              <span className="text-text-tertiary">Hecho por</span>
              <span className="text-body-semibold">{AUTOR.nombre}</span>
              <p className="text-text-secondary text-pretty">
                Indie hacker y product engineer desde Argentina. Construye proyectos open source pensados para usarse fuera del laboratorio,
                como este.
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <a
                  href={AUTOR.x}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-text-link hover:underline"
                >
                  <XLogo /> @unllamas
                </a>
                <a
                  href={AUTOR.web}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-text-link hover:underline"
                >
                  <RiGlobalLine className="size-4" aria-hidden /> jonallamas.com
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </UiProviders>
  );
}

/** Menú desplegable de escritorio: se abre con click, se cierra al elegir, al tocar afuera o con Escape. */
function Desplegable({ grupo, pathname }: { grupo: Grupo; pathname: string }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activo = grupo.items.some((i) => pathname.startsWith(i.to));

  // biome-ignore lint/correctness/useExhaustiveDependencies: close the dropdown whenever the route changes.
  useEffect(() => setAbierto(false), [pathname]);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setAbierto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        data-track="nav.group.toggle"
        data-track-group={grupo.label}
        data-track-open={String(!abierto)}
        className={buttonClassName({ variant: "tertiary", className: cx(activo && "text-text-link") })}
      >
        {grupo.label}
        <RiArrowDownSLine className={cx("size-5 transition-transform", abierto && "rotate-180")} aria-hidden />
      </button>
      {abierto && (
        <div className="absolute top-full right-0 z-30 mt-2 flex w-80 flex-col gap-1 rounded-xl border border-separator-border bg-background-primary-default p-2 shadow-xl">
          {grupo.items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="group flex min-h-11 items-start gap-3 rounded-2lg p-3 whitespace-normal hover:bg-background-secondary-default [&.active]:bg-background-secondary-default"
            >
              <item.icon className="mt-0.5 size-5 shrink-0 text-foreground-icon-secondary group-hover:text-text-link" aria-hidden />
              <span className="flex flex-col gap-0.5">
                <span className="text-body-medium text-text-link">{item.label}</span>
                <span className="text-text-tertiary">{item.descripcion}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Logo de X (el set de íconos no lo incluye). */
function XLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 fill-current" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
