import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calcFee, calcCancelRefund, PLATFORM_RATE } from "@/lib/fees";

// Create or refresh a PaymentIntent for the main fee. Returns clientSecret.
export const createPaymentIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string }) => d)
  .handler(async ({ data, context }) => {
    const { getStripe } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stripe = getStripe();

    const { data: req, error } = await context.supabase
      .from("requests").select("*").eq("id", data.requestId).maybeSingle();
    if (error || !req) throw new Error("Request not found");
    if (req.customer_id !== context.userId) throw new Error("Forbidden");

    // ensure fee
    const fee = calcFee({
      waitMinutes: req.estimated_wait_minutes ?? 30,
      isPeak: req.is_peak,
      extraFee: req.extra_fee ?? 0,
    });

    // Find or create matched worker stripe account (optional for now)
    let destination: string | undefined;
    const { data: match } = await supabaseAdmin
      .from("matches").select("worker_id").eq("request_id", req.id).maybeSingle();
    if (match) {
      const { data: workerProfile } = await supabaseAdmin
        .from("profiles").select("stripe_account_id, stripe_account_ready")
        .eq("id", match.worker_id).maybeSingle();
      if (workerProfile?.stripe_account_ready && workerProfile.stripe_account_id) {
        destination = workerProfile.stripe_account_id;
      }
    }

    const intent = await stripe.paymentIntents.create({
      amount: fee.total,
      currency: "jpy",
      automatic_payment_methods: { enabled: true },
      metadata: { request_id: req.id, customer_id: context.userId, kind: "main" },
      ...(destination
        ? {
            application_fee_amount: fee.platformFee,
            transfer_data: { destination },
          }
        : {}),
    });

    // remove previous pending main payments for idempotency
    await supabaseAdmin
      .from("payments")
      .delete()
      .eq("request_id", req.id)
      .eq("kind", "main")
      .eq("status", "pending");

    const { error: payErr } = await supabaseAdmin.from("payments").insert({
      request_id: req.id,
      amount: fee.total,
      platform_fee: fee.platformFee,
      worker_payout: fee.workerPayout,
      status: "pending",
      stripe_payment_intent_id: intent.id,
      stripe_client_secret: intent.client_secret,
      kind: "main",
    });
    if (payErr) console.error(payErr);

    // also update request total_fee
    await supabaseAdmin.from("requests").update({
      base_fee: fee.base,
      time_fee: fee.time,
      peak_fee: fee.peak,
      extra_fee: fee.extra,
      total_fee: fee.total,
    }).eq("id", req.id);

    return { clientSecret: intent.client_secret, amount: fee.total, breakdown: fee };
  });

// Charge an extension as a separate PaymentIntent
export const chargeExtension = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string; extraMinutes: number }) => d)
  .handler(async ({ data, context }) => {
    const { getStripe } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stripe = getStripe();

    const { data: req } = await context.supabase
      .from("requests").select("*").eq("id", data.requestId).maybeSingle();
    if (!req || req.customer_id !== context.userId) throw new Error("Forbidden");

    const extraAmount = Math.ceil(data.extraMinutes / 10) * 200;
    const platformFee = Math.round(extraAmount * PLATFORM_RATE);

    let destination: string | undefined;
    const { data: match } = await supabaseAdmin
      .from("matches").select("worker_id").eq("request_id", req.id).maybeSingle();
    if (match) {
      const { data: wp } = await supabaseAdmin
        .from("profiles").select("stripe_account_id, stripe_account_ready")
        .eq("id", match.worker_id).maybeSingle();
      if (wp?.stripe_account_ready && wp.stripe_account_id) destination = wp.stripe_account_id;
    }

    const intent = await stripe.paymentIntents.create({
      amount: extraAmount,
      currency: "jpy",
      automatic_payment_methods: { enabled: true },
      metadata: { request_id: req.id, kind: "extension" },
      ...(destination ? { application_fee_amount: platformFee, transfer_data: { destination } } : {}),
    });

    await supabaseAdmin.from("payments").insert({
      request_id: req.id,
      amount: extraAmount,
      platform_fee: platformFee,
      worker_payout: extraAmount - platformFee,
      status: "pending",
      stripe_payment_intent_id: intent.id,
      stripe_client_secret: intent.client_secret,
      kind: "extension",
    });

    await supabaseAdmin.from("requests").update({
      extra_fee: (req.extra_fee ?? 0) + extraAmount,
      total_fee: (req.total_fee ?? 0) + extraAmount,
    }).eq("id", req.id);

    return { clientSecret: intent.client_secret, amount: extraAmount };
  });

// Cancel + refund according to policy
export const cancelRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string; force?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { getStripe } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stripe = getStripe();

    const { data: req } = await context.supabase
      .from("requests").select("*").eq("id", data.requestId).maybeSingle();
    if (!req) throw new Error("Request not found");

    // Admin force cancel allowed; otherwise only owner
    const { data: isAdmin } = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "admin" }) as { data: boolean | null };
    if (!data.force && req.customer_id !== context.userId && !isAdmin) throw new Error("Forbidden");

    const { data: match } = await supabaseAdmin
      .from("matches").select("*").eq("request_id", req.id).maybeSingle();

    const { data: payments } = await supabaseAdmin
      .from("payments").select("*").eq("request_id", req.id).eq("status", "paid");
    const totalPaid = (payments ?? []).reduce((s, p) => s + p.amount, 0);

    const { refund } = calcCancelRefund({
      arrived: !!match?.arrival_time,
      startedAt: match?.start_time ? new Date(match.start_time) : null,
      canceledAt: new Date(),
      isPeak: req.is_peak,
      extraFee: req.extra_fee ?? 0,
      totalPaid,
    });

    // refund proportionally across paid intents (simplest: full refund of the latest until limit reached)
    let remaining = refund;
    for (const p of (payments ?? []).slice().reverse()) {
      if (remaining <= 0 || !p.stripe_payment_intent_id) break;
      const refundAmt = Math.min(remaining, p.amount - (p.refund_amount ?? 0));
      if (refundAmt <= 0) continue;
      try {
        await stripe.refunds.create({
          payment_intent: p.stripe_payment_intent_id,
          amount: refundAmt,
        });
        await supabaseAdmin.from("payments").update({
          refund_amount: (p.refund_amount ?? 0) + refundAmt,
          status: refundAmt >= p.amount ? "refunded" : "partially_refunded",
        }).eq("id", p.id);
        remaining -= refundAmt;
      } catch (e) {
        console.error("refund failed", e);
      }
    }

    await supabaseAdmin.from("requests").update({ status: "canceled" }).eq("id", req.id);
    return { refunded: refund };
  });
