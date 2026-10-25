import { getRouteApi } from "@tanstack/react-router";
import { PosterBuilder } from "@/features/posters/components/poster-builder.tsx";

const route = getRouteApi("/cartel");

/** /cartel: a poster about a municipality, to print or to share. */
export function CartelPage() {
  return <PosterBuilder municipalities={route.useLoaderData()} />;
}
