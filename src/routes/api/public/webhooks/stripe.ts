import { createFileRoute } from "@tanstack/react-router";
import { logJson } from "@/lib/log-schema";

export const Route = createFileRoute("/api/public/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const runId = crypto.randomUUID();
        const startedAt = Date.now();
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        const sig = request.headers.get("stripe-signature");
        const body = await request.text();

        logJson("info", "webhook.received", {
          runId,
          hasSignature: !!sig,
          bodyBytes: body.length,
          signatureVerified: false,
        });

        try {
          const { getStripe } = await import("@/lib/stripe.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const stripe = getStripe();

          // 1) 署名検証（本番では必須）。secret未設定時のみ開発用にフォールバック。
          let event: { id: string; type: string; data: { object: Record<string, unknown> } };
          if (secret) {
            if (!sig) {
              logJson("warn", "webhook.rejected", { runId, reason: "missing_signature", httpStatus: 400 });
              return new Response("missing stripe-signature", { status: 400 });
            }
            try {
              event = stripe.webhooks.constructEvent(body, sig, secret) as unknown as typeof event;
            } catch (err) {
              logJson("warn", "webhook.rejected", {
                runId,
                reason: `invalid_signature: ${(err as Error).message}`,
                httpStatus: 400,
              });
              return new Response("invalid signature", { status: 400 });
            }
          } else {
            logJson("warn", "webhook.rejected", {
              runId,
              reason: "no_secret_configured_dev_fallback",
              httpStatus: 200,
            });
            event = JSON.parse(body);
          }

          // 2) 冪等化: event_id をユニークキーとして先に登録。競合したら既処理として204で終了。
          const { error: dedupErr } = await supabaseAdmin
            .from("stripe_events")
            .insert({ event_id: event.id, type: event.type });
          if (dedupErr) {
            const code = (dedupErr as { code?: string; message?: string }).code;
            if (code === "23505") {
              logJson("info", "webhook.duplicate", { runId, eventId: event.id, type: event.type });
              return new Response("duplicate", { status: 200 });
            }
            logJson("error", "webhook.db_error", {
              runId,
              stage: "stripe_events.insert",
              message: (dedupErr as { message?: string }).message ?? "unknown",
              code: code ?? "unknown",
            });
            return new Response("db error", { status: 500 });
          }

          // 3) イベント種別ごとの処理（各更新はwhereで対象を絞るため二重実行しても安全）
          try {
            if (event.type === "payment_intent.succeeded") {
              // manual capture では capture 実行後に succeeded が届く
              const pi = event.data.object as { id: string };
              const { data: updated } = await supabaseAdmin.from("payments")
                .update({ status: "paid", captured_at: new Date().toISOString() })
                .eq("stripe_payment_intent_id", pi.id)
                .select("id");
              if (!updated?.length) logJson("warn", "webhook.payment_missing", { runId, paymentIntentId: pi.id, type: event.type });
            } else if (event.type === "payment_intent.amount_capturable_updated") {
              // manual capture のオーソリ成功時に発火
              const pi = event.data.object as { id: string };
              const { data: updated } = await supabaseAdmin.from("payments")
                .update({ status: "authorized", authorized_at: new Date().toISOString() })
                .eq("stripe_payment_intent_id", pi.id)
                .select("id");
              if (!updated?.length) logJson("warn", "webhook.payment_missing", { runId, paymentIntentId: pi.id, type: event.type });
            } else if (event.type === "payment_intent.canceled") {
              const pi = event.data.object as { id: string };
              await supabaseAdmin.from("payments")
                .update({ status: "canceled" })
                .eq("stripe_payment_intent_id", pi.id);
            } else if (event.type === "payment_intent.payment_failed") {
              const pi = event.data.object as { id: string };
              await supabaseAdmin.from("payments")
                .update({ status: "failed" })
                .eq("stripe_payment_intent_id", pi.id);
            } else if (event.type === "charge.refunded") {
              const charge = event.data.object as { payment_intent: string; amount_refunded: number };
              await supabaseAdmin.from("payments")
                .update({ refund_amount: charge.amount_refunded, status: "refunded" })
                .eq("stripe_payment_intent_id", charge.payment_intent);
            } else if (event.type === "account.updated") {
              const acc = event.data.object as { id: string; charges_enabled: boolean; payouts_enabled: boolean };
              const ready = !!acc.charges_enabled && !!acc.payouts_enabled;
              await supabaseAdmin.from("profiles")
                .update({ stripe_account_ready: ready })
                .eq("stripe_account_id", acc.id);
            }
          } catch (handlerErr) {
            // 処理失敗時は記録済みイベントを削除し、Stripeの再送を許可
            logJson("error", "webhook.handler_error", {
              runId,
              eventId: event.id,
              type: event.type,
              message: (handlerErr as Error).message ?? String(handlerErr),
            });
            await supabaseAdmin.from("stripe_events").delete().eq("event_id", event.id);
            return new Response("handler error", { status: 500 });
          }

          logJson("info", "webhook.processed", {
            runId,
            eventId: event.id,
            type: event.type,
            durationMs: Date.now() - startedAt,
          });
          return new Response("ok");
        } catch (err) {
          logJson("error", "webhook.rejected", {
            runId,
            reason: `unexpected: ${(err as Error).message ?? String(err)}`,
            httpStatus: 400,
          });
          return new Response("error", { status: 400 });
        }
      },
    },
  },
});
