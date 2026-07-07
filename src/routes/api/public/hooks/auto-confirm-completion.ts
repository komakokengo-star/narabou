import { createFileRoute } from "@tanstack/react-router";

/**
 * pg_cron から定期的に呼び出し、
 * 受け取り確認期限を過ぎた matches を自動的に「完了」扱いにし、決済を確定する。
 * apikey ヘッダで Supabase の anon/publishable key を検証する。
 */
export const Route = createFileRoute("/api/public/hooks/auto-confirm-completion")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        const provided = request.headers.get("apikey") ?? "";
        if (!expected || provided !== expected) {
          return new Response("unauthorized", { status: 401 });
        }
        const { autoConfirmExpired } = await import("@/lib/payments.functions");
        const result = await autoConfirmExpired();
        return new Response(JSON.stringify({ ok: true, ...result }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
