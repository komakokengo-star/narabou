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
      capture_method: "manual", // マッチ成立時にオーソリ、完了時にキャプチャ
      automatic_payment_methods: { enabled: true },
      metadata: { request_id: req.id, customer_id: context.userId, kind: "main" },
      ...(destination
        ? {
            application_fee_amount: fee.platformFee,
            transfer_data: { destination },
          }
        : {}),
    });

    // remove previous pending/authorized main payments for idempotency
    await supabaseAdmin
      .from("payments")
      .delete()
      .eq("request_id", req.id)
      .eq("kind", "main")
      .in("status", ["pending", "authorized"]);

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

    // 認可済みだが未キャプチャの決済は void（無料キャンセル）
    const { data: authPayments } = await supabaseAdmin
      .from("payments").select("*").eq("request_id", req.id)
      .in("status", ["authorized", "pending"]);
    for (const p of authPayments ?? []) {
      if (!p.stripe_payment_intent_id) continue;
      try {
        await stripe.paymentIntents.cancel(p.stripe_payment_intent_id);
        await supabaseAdmin.from("payments")
          .update({ status: "canceled" }).eq("id", p.id);
      } catch (e) {
        console.error("void authorization failed", e);
      }
    }

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

    // refund proportionally across paid intents
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

    // マッチもキャンセル
    if (match) {
      await supabaseAdmin.from("matches")
        .update({ status: "canceled" }).eq("id", match.id);
    }
    await supabaseAdmin.from("requests").update({ status: "canceled" }).eq("id", req.id);

    try {
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: context.userId,
        action: data.force ? "force_cancel" : "cancel_request",
        target_type: "request",
        target_id: req.id,
        details: {
          refunded: refund,
          total_paid: totalPaid,
          voided_authorizations: (authPayments ?? []).length,
          by_admin: !!isAdmin && data.force === true,
          previous_status: req.status,
        },
      });
    } catch (e) {
      console.error("audit log failed", e);
    }

    return { refunded: refund };
  });

// 依頼者が受注申請を承認/拒否（コメント任意・5分タイムアウト自動キャンセル対応）
export const respondToMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { matchId: string; approve: boolean; comment?: string; autoCancel?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: match } = await context.supabase
      .from("matches").select("*, requests(customer_id, status)")
      .eq("id", data.matchId).maybeSingle();
    if (!match) throw new Error("Match not found");
    const req = (match as unknown as { requests: { customer_id: string; status: string } }).requests;
    if (req.customer_id !== context.userId) throw new Error("Forbidden");
    if ((match as unknown as { status: string }).status !== "pending_approval") {
      throw new Error("既に処理済みです");
    }
    const now = new Date().toISOString();
    if (data.approve) {
      await supabaseAdmin.from("matches").update({
        status: "approved", approved_at: now,
        approval_comment: data.comment?.trim() || null,
      }).eq("id", data.matchId);
      await supabaseAdmin.from("requests").update({ status: "matched" }).eq("id", match.request_id);
    } else {
      await supabaseAdmin.from("matches").update({
        status: "rejected", rejected_at: now,
        auto_canceled_at: data.autoCancel ? now : null,
      }).eq("id", data.matchId);
      // 依頼を再オープン
      await supabaseAdmin.from("requests").update({ status: "open" }).eq("id", match.request_id);
    }
    return { ok: true };
  });


// 代行者の完了報告時に呼ばれ、オーソリ済み決済をキャプチャして確定
export const capturePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string }) => d)
  .handler(async ({ data, context }) => {
    const { getStripe } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stripe = getStripe();

    // 代行者/管理者のみ実行可
    const { data: match } = await context.supabase
      .from("matches").select("worker_id").eq("request_id", data.requestId).maybeSingle();
    const { data: isAdmin } = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "admin" }) as { data: boolean | null };
    if (!isAdmin && (!match || match.worker_id !== context.userId)) throw new Error("Forbidden");

    const { data: authPayments } = await supabaseAdmin
      .from("payments").select("*").eq("request_id", data.requestId).eq("status", "authorized");
    let capturedTotal = 0;
    for (const p of authPayments ?? []) {
      if (!p.stripe_payment_intent_id) continue;
      try {
        await stripe.paymentIntents.capture(p.stripe_payment_intent_id);
        await supabaseAdmin.from("payments").update({
          status: "paid", captured_at: new Date().toISOString(),
        }).eq("id", p.id);
        capturedTotal += p.amount;
      } catch (e) {
        console.error("capture failed", e);
        throw new Error("決済の確定に失敗しました");
      }
    }
    return { capturedTotal, count: (authPayments ?? []).length };
  });

