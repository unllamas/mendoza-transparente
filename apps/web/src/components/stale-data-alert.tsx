import { Alert } from "@mt/ui/components/alert";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * Warns that what follows is not from the current year, says why and how to ask for it. A page leads with the current
 * year; when a source is behind, this goes right before the data it affects: see docs/procesos/diseno.md, "El dato del
 * año en curso".
 */
export function StaleDataAlert({
  title,
  children,
  requestId,
}: {
  title: string;
  children: ReactNode;
  /** Item of /no-publicado with the request to make. */
  requestId: string;
}) {
  return (
    <Alert title={title}>
      {children}{" "}
      <Link
        to="/no-publicado"
        search={{ dato: requestId } as never}
        data-track="missing_data.stale.open"
        data-track-item={requestId}
        className="text-text-link underline"
      >
        Cómo pedir los datos al día
      </Link>
    </Alert>
  );
}
