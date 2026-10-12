import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Archive,
  Building2,
  ChevronDown,
  ChevronRight,
  Coins,
  EyeOff,
  GitBranch,
  Globe,
  Landmark,
  type LucideIcon,
  MapPin,
  Menu,
  Scale,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { REPO } from "../fuente.tsx";
import { usePageMeta } from "../seo.ts";

type Item = { to: string; label: string; descripcion: string; icon: LucideIcon };
type Grupo = { label: string; items: Item[] };

/** Navegación: dos destinos principales y dos grupos desplegables. */
const PRINCIPALES: { to: string; label: string }[] = [
  { to: "/senales", label: "Para mirar de cerca" },
  { to: "/funcionarios", label: "Funcionarios" },
];

const GRUPOS: Grupo[] = [
  {
    label: "Datos",
    items: [
      { to: "/deuda", label: "Deuda", descripcion: "Cuánto debe la provincia y a quién", icon: Landmark },
      { to: "/coparticipacion", label: "Coparticipación", descripcion: "Cuánto recibe cada municipio", icon: Coins },
      { to: "/empleo-publico", label: "Empleo público", descripcion: "Empleados por habitante y por provincia", icon: UsersRound },
      { to: "/poblacion", label: "Población", descripcion: "Cuántos somos en cada departamento", icon: Users },
      { to: "/municipios", label: "Municipios", descripcion: "Una página por cada uno de los 18", icon: MapPin },
    ],
  },
  {
    label: "Compras del Estado",
    items: [
      { to: "/proveedores", label: "Proveedores", descripcion: "A quiénes les compra el Gobierno", icon: Building2 },
      { to: "/organismos", label: "Organismos", descripcion: "Quién compra, cuánto y cómo", icon: Landmark },
    ],
  },
  {
    label: "Transparencia",
    items: [
      { to: "/leyes", label: "Leyes", descripcion: "Texto completo de las leyes provinciales", icon: Scale },
      { to: "/no-publicado", label: "Lo que no se publica", descripcion: "Datos que faltan y cómo pedirlos", icon: EyeOff },
      { to: "/fuentes", label: "Fuentes", descripcion: "De dónde sale cada dato", icon: Archive },
    ],
  },
];

const AUTOR = {
  nombre: "Jona Llamas",
  web: "https://jonallamas.com",
  x: "https://x.com/unllamas",
};

export function Layout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  usePageMeta(pathname);
  const [abierto, setAbierto] = useState(false);

  // El menú se cierra al navegar y la página no se desplaza detrás mientras está abierto.
  useEffect(() => setAbierto(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = abierto ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [abierto]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-page/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-5">
          <Link to="/" className="mr-auto text-base font-semibold tracking-tight whitespace-nowrap">
            Mendoza Transparente
          </Link>
          <nav aria-label="Principal" className="hidden items-center gap-1 text-sm whitespace-nowrap lg:flex">
            {PRINCIPALES.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-lg px-3 py-2 text-ink-2 hover:bg-tile hover:text-link [&.active]:font-medium [&.active]:text-link"
              >
                {item.label}
              </Link>
            ))}
            {GRUPOS.map((g) => (
              <Desplegable key={g.label} grupo={g} pathname={pathname} />
            ))}
          </nav>
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            aria-controls="menu-movil"
            aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
            className="-mr-2 flex size-10 items-center justify-center rounded-lg text-ink hover:bg-tile lg:hidden"
          >
            {abierto ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>

      </header>

      {/* Fuera del header: su backdrop-blur haría que el panel fijo se mida contra el header y no contra la pantalla. */}
      {abierto && (
        <nav
          id="menu-movil"
          aria-label="Principal"
          className="fixed inset-x-0 top-14 bottom-0 z-20 flex flex-col gap-6 overflow-y-auto border-t border-line bg-page px-4 py-5 lg:hidden"
        >
          <div className="flex flex-col">
            {PRINCIPALES.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center justify-between border-b border-line py-4 text-lg text-ink [&.active]:font-medium [&.active]:text-link"
              >
                {item.label}
                <ChevronRight className="size-4 text-ink-muted" aria-hidden />
              </Link>
            ))}
          </div>
          {GRUPOS.map((g) => (
            <div key={g.label} className="flex flex-col gap-1">
              <span className="text-xs font-medium tracking-wide text-ink-muted uppercase">{g.label}</span>
              {g.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex items-center gap-3 rounded-lg py-3 text-ink [&.active]:text-link"
                >
                  <item.icon className="size-5 shrink-0 text-ink-muted" aria-hidden />
                  <span className="flex flex-col">
                    <span className="text-base">{item.label}</span>
                    <span className="text-sm text-ink-muted">{item.descripcion}</span>
                  </span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
      )}

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-5 sm:py-10">
        <Outlet />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10 sm:px-5 md:flex-row md:justify-between">
          <div className="flex max-w-md flex-col gap-2 text-sm">
            <span className="font-semibold">Mendoza Transparente</span>
            <p className="text-ink-2 text-pretty">
              Proyecto ciudadano, independiente y apartidario. Cada número enlaza a su fuente oficial y los archivos
              originales se guardan tal cual se descargaron.
            </p>
            <a href={REPO} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1.5 text-link hover:underline">
              <GitBranch className="size-4" aria-hidden /> Código y datos abiertos en GitHub
            </a>
          </div>

          <div className="flex max-w-sm flex-col gap-2 text-sm">
            <span className="text-ink-muted">Hecho por</span>
            <span className="font-semibold">{AUTOR.nombre}</span>
            <p className="text-ink-2 text-pretty">
              Indie hacker y product engineer desde Argentina. Construye herramientas que funcionan fuera del
              laboratorio: de billeteras Lightning a la transparencia pública.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <a href={AUTOR.x} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-link hover:underline">
                <XLogo /> @unllamas
              </a>
              <a href={AUTOR.web} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-link hover:underline">
                <Globe className="size-4" aria-hidden /> jonallamas.com
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Menú desplegable de escritorio: se abre con click, se cierra al elegir, al tocar afuera o con Escape. */
function Desplegable({ grupo, pathname }: { grupo: Grupo; pathname: string }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activo = grupo.items.some((i) => pathname.startsWith(i.to));

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
        className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 hover:bg-tile hover:text-link ${
          activo ? "font-medium text-link" : "text-ink-2"
        }`}
      >
        {grupo.label}
        <ChevronDown className={`size-4 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {abierto && (
        <div className="absolute top-full right-0 z-30 mt-2 flex w-80 flex-col gap-1 rounded-xl border border-line bg-surface p-2 shadow-xl">
          {grupo.items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="group flex items-start gap-3 rounded-lg p-3 whitespace-normal hover:bg-tile [&.active]:bg-tile"
            >
              <item.icon className="mt-0.5 size-5 shrink-0 text-ink-muted group-hover:text-link" aria-hidden />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium text-ink group-hover:text-link">{item.label}</span>
                <span className="text-ink-muted">{item.descripcion}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Logo de X (lucide no lo incluye). */
function XLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 fill-current" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
