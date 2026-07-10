import { createFileRoute } from "@tanstack/react-router";

/**
 * pg_cron から呼び出し、希望日時 + ABANDON_HOURS を経過しても完了報告のない
 * 進行中マッチを強制完了（顧客請求void・代行者報酬¥0）する。
 */
export const Route = createFileRoute("/api/public/hooks/auto-force-complete-abandoned")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        const provided = request.headers.get("apikey") ?? "";
        if (!expected || provided !== expected) {
          return new Response("unauthorized", { status: 401 });
        }
        const { autoForceCompleteAbandoned } = await import("@/lib/payments.functions");
        const result = await autoForceCompleteAbandoned();
        return new Response(JSON.stringify({ ok: true, ...result }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
