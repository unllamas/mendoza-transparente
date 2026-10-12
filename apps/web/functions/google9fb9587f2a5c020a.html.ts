/**
 * Google Search Console verification file. Served by a function because Cloudflare Pages redirects
 * "/x.html" to "/x" for static files, and the verification needs the exact URL without redirects.
 * Do not delete: Google checks it periodically (docs/procesos/web.md).
 */
export const onRequest = () =>
  new Response("google-site-verification: google9fb9587f2a5c020a.html", {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
