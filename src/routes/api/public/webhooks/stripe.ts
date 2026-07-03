import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        const sig = request.headers.get("stripe-signature");
        const body = await request.text();

        try {
          const { getStripe } = await import("@/lib/stripe.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const stripe = getStripe();

          // 1) 署名検証（本番では必須）。secret未設定時のみ開発用にフォールバック。
          let event: { id: string; type: string; data: { object: Record<string, unknown> } };
          if (secret) {
            if (!sig) {
              return new Response("missing stripe-signature", { status: 400 });
            }
            try {
              event = stripe.webhooks.constructEvent(body, sig, secret) as typeof event;
            } catch (err) {
              console.error("Stripe signature verification failed", err);
              return new Response("invalid signature", { status: 400 });
            }
          } else {
            console.warn("STRIPE_WEBHOOK_SECRET not set - accepting unverified webhook (dev only)");
            event = JSON.parse(body);
          }

          // 2) 冪等化: event_id をユニークキーとして先に登録。競合したら既処理として204で終了。
          const { error: dedupErr } = await supabaseAdmin
            .from("stripe_events")
            .insert({ event_id: event.id, type: event.type });
          if (dedupErr) {
            // 23505 = unique_violation → 既に処理済み
            if ((dedupErr as { code?: string }).code === "23505") {
              return new Response("duplicate", { status: 200 });
            }
            console.error("stripe_events insert failed", dedupErr);
            return new Response("db error", { status: 500 });
          }

          // 3) イベント種別ごとの処理（各更新はwhereで対象を絞るため二重実行しても安全）
          try {
            if (event.type === "payment_intent.succeeded") {
              const pi = event.data.object as { id: string };
              await supabaseAdmin.from("payments")
                .update({ status: "paid" })
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
            console.error("Handler failed for", event.id, handlerErr);
            await supabaseAdmin.from("stripe_events").delete().eq("event_id", event.id);
            return new Response("handler error", { status: 500 });
          }

          return new Response("ok");
        } catch (err) {
          console.error("Webhook error", err);
          return new Response("error", { status: 400 });
        }
      },
    },
  },
});
