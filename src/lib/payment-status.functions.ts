import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const syncPaymentIntentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { clientSecret: string }) => data)
  .handler(async ({ data, context }) => {
    const paymentIntentId = data.clientSecret.split("_secret_")[0];
    if (!paymentIntentId?.startsWith("pi_")) throw new Error("決済情報が正しくありません");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getStripe } = await import("@/lib/stripe.server");
    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("id, request_id, stripe_payment_intent_id, requests(customer_id)")
      .eq("stripe_payment_intent_id", paymentIntentId)
      .maybeSingle();

    const ownerId = (payment as unknown as { requests?: { customer_id?: string } | null } | null)?.requests?.customer_id;
    if (!payment || ownerId !== context.userId) throw new Error("決済情報が見つかりません");

    const stripe = getStripe();
    let intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const { data: match } = await supabaseAdmin
      .from("matches")
      .select("status")
      .eq("request_id", payment.request_id)
      .maybeSingle();

    // A previously completed job may have missed capture because authorization had
    // not finished yet. Capture it immediately after the customer authorizes it.
    if (intent.status === "requires_capture" && match?.status === "completed") {
      intent = await stripe.paymentIntents.capture(paymentIntentId);
    }

    const now = new Date().toISOString();
    if (intent.status === "requires_capture") {
      await supabaseAdmin.from("payments").update({ status: "authorized", authorized_at: now }).eq("id", payment.id);
      return { status: "authorized" as const };
    }
    if (intent.status === "succeeded") {
      await supabaseAdmin.from("payments").update({ status: "paid", captured_at: now }).eq("id", payment.id);
      return { status: "paid" as const };
    }
    if (intent.status === "canceled") {
      await supabaseAdmin.from("payments").update({ status: "canceled" }).eq("id", payment.id);
      return { status: "canceled" as const };
    }

    return { status: intent.status };
  });