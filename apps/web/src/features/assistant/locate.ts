import { loadTema } from "@/lib.ts";
import type { MapaMendoza } from "@/types.ts";

const SVG = "http://www.w3.org/2000/svg";

/** The browser's position, or null if it is not available, denied or too slow. */
export function currentPosition(): Promise<GeolocationCoordinates | null> {
  if (!("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p.coords),
      () => resolve(null),
      // A coarse fix is enough to know the municipality and is faster and lighter on the battery.
      { timeout: 8000, maximumAge: 600_000, enableHighAccuracy: false },
    ),
  );
}

/**
 * Municipality that contains a point, with the site's own department map (IGN boundaries) and its projection.
 * Runs in the browser: the location never leaves the device. Null outside Mendoza or if the map has no projection.
 */
export async function municipalityAt(lat: number, lon: number): Promise<string | null> {
  const map = await loadTema<MapaMendoza>("mapa");
  if (!map.proyeccion) return null;
  const { minLon, maxLat, cosLat, scale } = map.proyeccion;
  const point = new DOMPoint((lon - minLon) * cosLat * scale, (maxLat - lat) * scale);
  // isPointInFill needs the paths in the document; an invisible, empty SVG is enough.
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", map.viewBox);
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;visibility:hidden";
  document.body.append(svg);
  try {
    for (const d of map.departamentos) {
      const path = document.createElementNS(SVG, "path");
      path.setAttribute("d", d.path);
      svg.append(path);
      if (path.isPointInFill(point)) return d.municipio;
    }
    return null;
  } finally {
    svg.remove();
  }
}
