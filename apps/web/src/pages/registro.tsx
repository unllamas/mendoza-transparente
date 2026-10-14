import { Alert } from "@mt/ui/components/alert";
import { buttonClassName } from "@mt/ui/components/base/buttons/button";
import { tileVariants } from "@mt/ui/components/card";
import { PageHeader } from "@mt/ui/components/section";
import { cx } from "@mt/ui/lib/cx";
import { RiArchiveStackLine } from "@remixicon/react";
import { getRouteApi, Link } from "@tanstack/react-router";
import { TrackedSegmented } from "@/components/tracked-segmented.tsx";
import { useRegistry } from "@/features/participation/api/registry.ts";
import { CorrectionList, CorrectionSheet, RequestList, RequestSheet } from "@/features/participation/components/registry.tsx";
import { useUrlOption, useUrlText } from "@/url-state.ts";

const route = getRouteApi("/registro");

type View = "pedidos" | "correcciones";

export function RegistroPage() {
  const items = route.useLoaderData();
  const titles = Object.fromEntries(items.map((i) => [i.id, i.titulo]));
  const registry = useRegistry();
  const [view, setView] = useUrlOption<View>("ver", ["pedidos", "correcciones"], "pedidos");
  // The open submission (?codigo=P-…) lives in the URL, so each one can be shared.
  const [code, setCode] = useUrlText("codigo");
  const openCode = code.toUpperCase();

  const requests = registry?.requests ?? [];
  const corrections = registry?.corrections ?? [];
  const answered = requests.filter((r) => r.status === "respondido" || r.status === "parcial").length;
  const unanswered = requests.filter((r) => r.status === "denegado" || r.overdue).length;
  const openRequest = requests.find((r) => r.code === openCode);
  const openCorrection = corrections.find((c) => c.code === openCode);

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <PageHeader icon={RiArchiveStackLine} topic="Participá" title="Registro de pedidos y correcciones">
        Los pedidos de acceso a la información que presentó la gente y qué respondió el Estado, y los errores que nos avisaron y corregimos.
        Publicamos cada uno después de revisarlo, sin datos personales.
      </PageHeader>

      {requests.length > 0 && (
        <div className={cx(tileVariants({ size: "sm" }), "grid grid-cols-3 divide-x divide-separator-border text-center")}>
          <Counter value={requests.length} label={requests.length === 1 ? "pedido publicado" : "pedidos publicados"} />
          <Counter value={answered} label="con respuesta" />
          <Counter value={unanswered} label="negados o vencidos" />
        </div>
      )}

      <TrackedSegmented
        label="Qué ver"
        options={[
          { value: "pedidos", label: `Pedidos${registry ? ` (${requests.length})` : ""}` },
          { value: "correcciones", label: `Correcciones${registry ? ` (${corrections.length})` : ""}` },
        ]}
        value={view}
        onChange={setView}
        trackId="registry.view"
      />

      {registry === undefined && <p className="text-body-regular text-text-tertiary">Cargando el registro…</p>}
      {registry === null && (
        <Alert title="No pudimos cargar el registro">Probá de nuevo en un rato. Si sigue sin andar, avisanos desde Participá.</Alert>
      )}
      {registry && view === "pedidos" && requests.length > 0 && <RequestList requests={requests} titles={titles} onOpen={setCode} />}
      {registry && view === "correcciones" && corrections.length > 0 && <CorrectionList corrections={corrections} onOpen={setCode} />}
      {registry && (view === "pedidos" ? requests : corrections).length === 0 && (
        <div className={cx(tileVariants(), "flex flex-col items-start gap-3")}>
          <p className="text-body-regular text-text-secondary text-pretty">
            {view === "pedidos"
              ? "Todavía no hay pedidos publicados. Si presentaste uno, registralo: después de revisarlo, aparece acá."
              : "Todavía no hay correcciones publicadas. Si ves un dato mal, avisanos."}
          </p>
          <Link
            to="/participar"
            search={{ tipo: view === "pedidos" ? "pedido" : "error" } as never}
            className={buttonClassName({ variant: "secondary" })}
          >
            {view === "pedidos" ? "Registrar mi pedido" : "Reportar un error"}
          </Link>
        </div>
      )}

      {code && registry && !openRequest && !openCorrection && (
        <Alert title={`No hay ningún envío publicado con el código ${openCode}`}>
          Puede que todavía lo estemos revisando, o que no se publique (por ejemplo, si era una consulta personal).
        </Alert>
      )}
      {openRequest && <RequestSheet request={openRequest} titles={titles} onClose={() => setCode(null)} />}
      {openCorrection && <CorrectionSheet correction={openCorrection} onClose={() => setCode(null)} />}
    </div>
  );
}

function Counter({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-2">
      <span className="text-title-1-semibold tabular-nums">{value}</span>
      <span className="text-caption-1-regular text-balance text-text-tertiary">{label}</span>
    </div>
  );
}
