import { createFileRoute } from "@tanstack/react-router";

/**
 * pg_cron から定期的に呼び出し、希望日時を大きく超過した未マッチ依頼(open)を
 * 自動キャンセルする。apikey ヘッダで publishable/anon key を検証。
 */
export const Route = createFileRoute("/api/public/hooks/auto-cancel-overdue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        const provided = request.headers.get("apikey") ?? "";
        if (!expected || provided !== expected) {
          return new Response("unauthorized", { status: 401 });
        }
        const { autoCancelOverdueRequests } = await import("@/lib/payments.functions");
        const result = await autoCancelOverdueRequests();
        return new Response(JSON.stringify({ ok: true, ...result }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
