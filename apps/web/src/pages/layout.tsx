import { Link, Outlet } from "@tanstack/react-router";

const REPO = "https://github.com/unllamas/mendoza-transparente";

export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line">
        <nav className="mx-auto flex max-w-5xl items-center gap-6 px-5 py-4 text-sm">
          <Link to="/" className="mr-auto text-base font-semibold tracking-tight">
            Mendoza Transparente
          </Link>
          <Link to="/" className="text-ink-2 hover:text-ink [&.active]:text-ink" activeOptions={{ exact: true }}>
            Inicio
          </Link>
          <Link to="/deuda" className="text-ink-2 hover:text-ink [&.active]:text-ink">
            Deuda
          </Link>
          <Link to="/empleo-publico" className="text-ink-2 hover:text-ink [&.active]:text-ink">
            Empleo público
          </Link>
          <Link to="/fuentes" className="text-ink-2 hover:text-ink [&.active]:text-ink">
            Fuentes
          </Link>
          <a href={REPO} className="text-ink-2 hover:text-ink">
            GitHub
          </a>
        </nav>
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
            <a href={REPO} className="underline hover:text-ink">
              GitHub
            </a>
            .
          </p>
        </div>
      </footer>
    </div>
  );
}
