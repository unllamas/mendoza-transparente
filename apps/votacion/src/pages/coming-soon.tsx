import { buttonClassName } from "@mt/ui/components/base/buttons/button";
import { cx } from "@mt/ui/lib/cx";

/** Placeholder while the elections site is being built. Not indexed (index.html, _headers and robots.txt). */
export function ComingSoonPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 p-6">
      <h1 className="text-display-4-semibold tracking-tight text-balance text-text-primary sm:text-display-3-semibold">
        Votación en Mendoza
      </h1>
      <p className="text-body-regular text-text-secondary text-pretty">
        Estamos preparando los resultados de las elecciones provinciales, mesa por mesa, para seguir el próximo conteo en vivo.
      </p>
      <a href="https://mendoza-transparente.com" className={cx(buttonClassName({ variant: "primary" }), "self-start")}>
        Ir a Mendoza Transparente
      </a>
    </main>
  );
}
