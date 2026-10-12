import { Link, Outlet, useRouterState } from "@tanstack/react-router";

import { usePageMeta } from "../seo.ts";

const REPO = "https://github.com/unllamas/mendoza-transparente";

const NAV = [
  { to: "/funcionarios", label: "Funcionarios" },
  { to: "/deuda", label: "Deuda" },
  { to: "/coparticipacion", label: "Coparticipación" },
  { to: "/empleo-publico", label: "Empleo público" },
  { to: "/poblacion", label: "Población" },
  { to: "/no-publicado", label: "Lo que no se publica" },
  { to: "/fuentes", label: "Fuentes" },
] as const;

export function Layout() {
  usePageMeta(useRouterState({ select: (s) => s.location.pathname }));

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
          <Link to="/" className="mr-auto text-base font-semibold tracking-tight">
            Mendoza Transparente
          </Link>
          <nav className="-mx-5 flex w-full gap-5 overflow-x-auto px-5 text-sm whitespace-nowrap sm:mx-0 sm:w-auto sm:px-0">
            {NAV.map((item) => (
              <Link key={item.to} to={item.to} className="text-ink-2 hover:text-link [&.active]:font-medium [&.active]:text-link">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
        <Outlet />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-5 py-6 text-sm text-ink-muted">
          <p>
            Cada número enlaza a su fuente oficial. Los archivos originales se guardan tal cual se descargaron.
          </p>
          <p>
            Proyecto ciudadano e independiente. Código abierto en{" "}
            <a href={REPO} className="underline hover:text-link">
              GitHub
            </a>
            .
          </p>
        </div>
      </footer>
    </div>
  );
}
