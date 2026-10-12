/** Reparte los procesos de compra en archivos chicos para cargarlos de a uno. Lo usan el build y la web. */
export const PROCESO_SHARDS = 64;

export function procesoShard(ocid: string): number {
  let h = 0;
  for (let i = 0; i < ocid.length; i++) h = (h * 31 + ocid.charCodeAt(i)) >>> 0;
  return h % PROCESO_SHARDS;
}
