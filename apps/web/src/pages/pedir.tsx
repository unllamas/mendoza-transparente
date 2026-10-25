import { getRouteApi } from "@tanstack/react-router";
import { RequestLetterFlow } from "@/features/request-letter/components/request-letter-flow.tsx";

const route = getRouteApi("/pedir");

/** /pedir: a request letter for any public body, filled in on the page and downloaded as a PDF. */
export function PedirPage() {
  return <RequestLetterFlow targets={route.useLoaderData()} />;
}
