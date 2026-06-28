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
          const stripe = getStripe();
          let event;
          if (secret && sig) {
            event = stripe.webhooks.constructEvent(body, sig, secret);
          } else {
            // dev-mode: parse without verification
            event = JSON.parse(body);
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          if (event.type === "payment_intent.succeeded") {
            const pi = event.data.object as { id: string; metadata?: Record<string, string> };
            await supabaseAdmin
              .from("payments")
              .update({ status: "paid" })
              .eq("stripe_payment_intent_id", pi.id);
          } else if (event.type === "payment_intent.payment_failed") {
            const pi = event.data.object as { id: string };
            await supabaseAdmin
              .from("payments")
              .update({ status: "failed" })
              .eq("stripe_payment_intent_id", pi.id);
          } else if (event.type === "charge.refunded") {
            const charge = event.data.object as { payment_intent: string; amount_refunded: number };
            await supabaseAdmin
              .from("payments")
              .update({
                refund_amount: charge.amount_refunded,
                status: "refunded",
              })
              .eq("stripe_payment_intent_id", charge.payment_intent);
          } else if (event.type === "account.updated") {
            const acc = event.data.object as { id: string; charges_enabled: boolean; payouts_enabled: boolean };
            const ready = !!acc.charges_enabled && !!acc.payouts_enabled;
            await supabaseAdmin
              .from("profiles")
              .update({ stripe_account_ready: ready })
              .eq("stripe_account_id", acc.id);
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
