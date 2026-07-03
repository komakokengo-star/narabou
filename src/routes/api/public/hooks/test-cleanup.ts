import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * E2Eテスト用クリーンアップエンドポイント。
 * `evt_test_%` / `pi_test_%` / `acct_test_%` プレフィックスのテストレコードのみ削除する。
 * STRIPE_WEBHOOK_SECRET を用いたHMAC署名で保護（±5分の時刻ずれまで許容）。
 *
 * 呼び方:
 *   ts=$(date +%s)
 *   sig=$(printf "%s" "$ts" | openssl dgst -sha256 -hmac "$STRIPE_WEBHOOK_SECRET" -hex | awk '{print $2}')
 *   curl -X POST -H "x-test-cleanup: t=$ts,v1=$sig" <URL>
 */
export const Route = createFileRoute("/api/public/hooks/test-cleanup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) return new Response("secret not configured", { status: 500 });

        const header = request.headers.get("x-test-cleanup") ?? "";
        const parts = Object.fromEntries(
          header.split(",").map((p) => p.split("=") as [string, string]),
        );
        const ts = parts.t;
        const v1 = parts.v1;
        if (!ts || !v1) return new Response("missing signature", { status: 400 });

        const tsNum = Number(ts);
        if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) {
          return new Response("stale timestamp", { status: 400 });
        }
        const expected = createHmac("sha256", secret).update(ts).digest("hex");
        const a = Buffer.from(v1);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("invalid signature", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const [ev, py] = await Promise.all([
          supabaseAdmin.from("stripe_events").delete().like("id", "evt_test_%").select("id"),
          supabaseAdmin
            .from("payments")
            .delete()
            .like("stripe_payment_intent_id", "pi_test_%")
            .select("id"),
        ]);
        if (ev.error || py.error) {
          return new Response(
            JSON.stringify({ ev: ev.error?.message, py: py.error?.message }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            ok: true,
            deleted: { stripe_events: ev.data?.length ?? 0, payments: py.data?.length ?? 0 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
