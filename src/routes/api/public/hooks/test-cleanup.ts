import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * E2Eテスト用エンドポイント。
 * POST: `evt_test_%` / `pi_test_%` プレフィックスのテストレコードのみ削除
 * GET : 残っているテストレコード件数を返す（検証用）
 * STRIPE_WEBHOOK_SECRET を用いたHMAC署名で保護（±5分の時刻ずれまで許容）。
 */
function verifySignature(request: Request, secret: string): Response | null {
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
  return null;
}

export const Route = createFileRoute("/api/public/hooks/test-cleanup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) return new Response("secret not configured", { status: 500 });
        const bad = verifySignature(request, secret);
        if (bad) return bad;

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
      GET: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) return new Response("secret not configured", { status: 500 });
        const bad = verifySignature(request, secret);
        if (bad) return bad;

        const url = new URL(request.url);
        const withSamples = url.searchParams.get("samples") === "1";
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const [ev, py, evRows, pyRows] = await Promise.all([
          supabaseAdmin
            .from("stripe_events")
            .select("id", { count: "exact", head: true })
            .like("id", "evt_test_%"),
          supabaseAdmin
            .from("payments")
            .select("id", { count: "exact", head: true })
            .like("stripe_payment_intent_id", "pi_test_%"),
          withSamples
            ? supabaseAdmin
                .from("stripe_events")
                .select("*")
                .like("id", "evt_test_%")
                .limit(limit)
            : Promise.resolve({ data: null, error: null }),
          withSamples
            ? supabaseAdmin
                .from("payments")
                .select("*")
                .like("stripe_payment_intent_id", "pi_test_%")
                .limit(limit)
            : Promise.resolve({ data: null, error: null }),
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
            remaining: { stripe_events: ev.count ?? 0, payments: py.count ?? 0 },
            samples: withSamples
              ? { stripe_events: evRows.data ?? [], payments: pyRows.data ?? [] }
              : undefined,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
