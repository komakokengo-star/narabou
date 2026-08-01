import { createFileRoute } from "@tanstack/react-router";

// Returns the browser-side Google Maps key. This must be a publishable,
// HTTP-referrer-restricted key for app.narabou.jp.
export const Route = createFileRoute("/api/public/maps-config")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // The user's own key is referrer-restricted to *.narabou.jp.
        // The Lovable-managed key only works on *.lovable.app.
        // Return the custom key only for narabou.jp hosts; otherwise let the
        // client fall back to the managed browser key.
        const host = new URL(request.url).hostname;
        const isCustomDomain = host === "narabou.jp" || host.endsWith(".narabou.jp");
        const key = isCustomDomain
          ? process.env["GOOGLE_API_KEY"] || process.env["GOOGLE_MAPS_BROWSER_KEY"] || null
          : null;
        return new Response(JSON.stringify({ key }), {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "public, max-age=300",
          },
        });
      },
    },
  },
});
