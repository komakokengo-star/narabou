import { createFileRoute } from "@tanstack/react-router";

// Returns the browser-side Google Maps key. This key is a publishable,
// HTTP-referrer-restricted key (app.narabou.jp), so exposing it is expected.
export const Route = createFileRoute("/api/public/maps-config")({
  server: {
    handlers: {
      GET: async () => {
        const key =
          process.env["GOOGLE_API_KEY"] ||
          process.env["GOOGLE_MAPS_BROWSER_KEY"] ||
          null;
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
