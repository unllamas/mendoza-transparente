import { buttonClassName } from "@mt/ui/components/base/buttons/button";
import { cx } from "@mt/ui/lib/cx";
import {
  type RemixiconComponentType,
  RiBarChart2Line,
  RiChat3Line,
  RiDashboardLine,
  RiFileList3Line,
  RiInbox2Line,
  RiLogoutBoxRLine,
  RiShieldKeyholeLine,
  RiShieldLine,
} from "@remixicon/react";
import { Link, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SESSION_EXPIRED_EVENT, useApi } from "../api.ts";

const NAV: {
  to: "/" | "/bandeja" | "/estadisticas" | "/seguridad" | "/asistente" | "/auditoria";
  label: string;
  icon: RemixiconComponentType;
}[] = [
  { to: "/", label: "Inicio", icon: RiDashboardLine },
  { to: "/bandeja", label: "Bandeja", icon: RiInbox2Line },
  { to: "/estadisticas", label: "Estadísticas", icon: RiBarChart2Line },
  { to: "/seguridad", label: "Seguridad", icon: RiShieldLine },
  { to: "/asistente", label: "Asistente", icon: RiChat3Line },
  { to: "/auditoria", label: "Auditoría", icon: RiFileList3Line },
];

/** Access's own logout: closes the session on every application of the team. */
const LOGOUT = "/cdn-cgi/access/logout";

export function Layout() {
  const me = useApi<{ email: string }>("/api/panel/me");
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const on = () => setExpired(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, on);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, on);
  }, []);

  if (expired)
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <RiShieldKeyholeLine className="size-8 text-foreground-icon-secondary" aria-hidden />
        <h1 className="text-title-2-semibold">Tu sesión venció</h1>
        <p className="max-w-sm text-body-regular text-text-secondary text-pretty">
          Por seguridad, la sesión del panel dura unas horas. Volvé a entrar con tu correo: te llega un código nuevo.
        </p>
        <button type="button" className={buttonClassName({ variant: "primary" })} onClick={() => window.location.reload()}>
          Volver a entrar
        </button>
      </main>
    );

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col gap-2 border-separator-border border-b bg-background-surface p-3 lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:border-r lg:border-b-0 lg:p-4">
        <div className="flex h-11 items-center gap-2 px-2">
          <img src="/favicon.svg" alt="" className="size-6" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-body-semibold">Panel interno</span>
            <span className="truncate text-caption-1-regular text-text-tertiary">Mendoza Transparente</span>
          </span>
        </div>
        <nav aria-label="Secciones del panel" className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] lg:flex-col">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.to === "/", includeSearch: false }}
              className="flex min-h-11 shrink-0 items-center gap-3 rounded-2lg px-3 text-body-medium text-text-secondary hover:bg-background-interactive data-[status=active]:bg-background-interactive data-[status=active]:text-text-primary"
            >
              <n.icon className="size-5 shrink-0" aria-hidden />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden flex-col gap-1 border-separator-border border-t pt-3 lg:flex">
          <span className="truncate px-2 text-caption-1-regular text-text-tertiary" title={me.data?.email}>
            {me.data?.email ?? "…"}
          </span>
          <a href={LOGOUT} className={cx(buttonClassName({ variant: "tertiary" }), "justify-start")}>
            <RiLogoutBoxRLine className="size-4" aria-hidden /> Salir
          </a>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <Outlet />
        <a href={LOGOUT} className={cx(buttonClassName({ variant: "tertiary" }), "m-3 w-fit lg:hidden")}>
          <RiLogoutBoxRLine className="size-4" aria-hidden /> Salir ({me.data?.email ?? "…"})
        </a>
      </main>
    </div>
  );
}

/** Header of each screen: a title and, on the right, its actions. */
export function ScreenHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-separator-border border-b px-4 py-2 lg:px-6">
      <h1 className="text-title-3-semibold tracking-tight">{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
