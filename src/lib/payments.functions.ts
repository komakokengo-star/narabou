import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calcFee, calcCancelRefund, PLATFORM_RATE } from "@/lib/fees";

// Create or refresh a PaymentIntent for the main fee. Returns clientSecret.
export const createPaymentIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string }) => d)
  .handler(async ({ data, context }) => {
    const { getStripe, ensureWalletDomains } = await import("@/lib/stripe.server");
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

    const { data: activePayments } = await supabaseAdmin
      .from("payments")
      .select("id, amount, status, stripe_payment_intent_id, stripe_client_secret")
      .eq("request_id", req.id)
      .eq("kind", "main")
      .in("status", ["pending", "authorized"])
      .order("created_at", { ascending: false });

    const authorizedPayment = activePayments?.find((payment) => payment.status === "authorized");
    if (authorizedPayment) throw new Error("この依頼の仮押さえは完了しています");

    const pendingPayment = activePayments?.find((payment) => payment.status === "pending");
    if (pendingPayment?.stripe_payment_intent_id && pendingPayment.stripe_client_secret && pendingPayment.amount === fee.total) {
      const existingIntent = await stripe.paymentIntents.retrieve(pendingPayment.stripe_payment_intent_id);
      if (["requires_payment_method", "requires_confirmation", "requires_action"].includes(existingIntent.status)) {
        return { clientSecret: pendingPayment.stripe_client_secret, amount: fee.total, breakdown: fee };
      }
    }

    // Keep historical rows and close stale Stripe intents before replacing them.
    for (const payment of activePayments?.filter((item) => item.status === "pending") ?? []) {
      if (payment.stripe_payment_intent_id) {
        try {
          await stripe.paymentIntents.cancel(payment.stripe_payment_intent_id);
        } catch (error) {
          console.warn("stale PaymentIntent cancellation skipped", payment.stripe_payment_intent_id, error);
        }
      }
      await supabaseAdmin.from("payments").update({ status: "canceled" }).eq("id", payment.id);
    }

    await ensureWalletDomains(stripe);

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
    const { getStripe, ensureWalletDomains } = await import("@/lib/stripe.server");
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

    await ensureWalletDomains(stripe);

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
    const { getStripe, ensureWalletDomains } = await import("@/lib/stripe.server");
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
        rejection_comment: data.autoCancel ? null : (data.comment?.trim() || null),
      }).eq("id", data.matchId);
      // 依頼を再オープン
      await supabaseAdmin.from("requests").update({ status: "open" }).eq("id", match.request_id);
    }
    return { ok: true };
  });

// 代行者が公開中の依頼へ受注申請を送る。既存の rejected/canceled match があれば
// unique 制約に抵触するため、サービスロールでリセットして再利用する。
export const applyForRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string; applyComment?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isWorker } = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "worker" }) as { data: boolean | null };
    if (!isWorker) throw new Error("Forbidden");

    const comment = data.applyComment?.trim() || null;

    const { data: existing } = await supabaseAdmin
      .from("matches").select("id, status").eq("request_id", data.requestId).maybeSingle();

    if (existing) {
      if (existing.status === "pending_approval" || existing.status === "approved") {
        throw new Error("この依頼は既に他の代行者が受注申請中です");
      }
      const { error: updErr } = await supabaseAdmin.from("matches").update({
        worker_id: context.userId,
        status: "pending_approval",
        created_at: new Date().toISOString(),
        approved_at: null,
        rejected_at: null,
        auto_canceled_at: null,
        approval_comment: null,
        apply_comment: comment,
      }).eq("id", existing.id);
      if (updErr) throw new Error(updErr.message);
    } else {
      const { error: insErr } = await supabaseAdmin.from("matches").insert({
        request_id: data.requestId,
        worker_id: context.userId,
        status: "pending_approval",
        apply_comment: comment,
      });
      if (insErr) throw new Error(insErr.message);
    }

    await supabaseAdmin.from("requests").update({ status: "matched" }).eq("id", data.requestId);
    return { ok: true };
  });




// 代行者の完了報告時に呼ばれ、オーソリ済み決済をキャプチャして確定
export const capturePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string }) => d)
  .handler(async ({ data, context }) => {
    const { getStripe, ensureWalletDomains } = await import("@/lib/stripe.server");
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


// ============================================================
// 完了フロー（2段階承認）
// 代行者「完了報告」→ 依頼者「受け取り確認 or 異議申立」→ 決済確定
// 30分以内に依頼者応答が無ければ自動確認して決済確定
// ============================================================

const CONFIRM_WINDOW_MINUTES = 30;

// 内部ヘルパー: オーソリ済みをキャプチャ
async function _captureAuthorized(requestId: string) {
  const { getStripe } = await import("@/lib/stripe.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const stripe = getStripe();
  const { data: authPayments } = await supabaseAdmin
    .from("payments").select("*").eq("request_id", requestId).eq("status", "authorized");
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
}

// 代行者: 完了報告（決済はまだ確定しない）
export const requestCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string; completionNote?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: match } = await context.supabase
      .from("matches").select("id, worker_id, status").eq("request_id", data.requestId).maybeSingle();
    if (!match) throw new Error("Match not found");
    const { data: isAdmin } = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "admin" }) as { data: boolean | null };
    if (!isAdmin && match.worker_id !== context.userId) throw new Error("Forbidden");
    if (match.status !== "in_progress") throw new Error("業務中のみ完了報告できます");

    const now = new Date();
    const deadline = new Date(now.getTime() + CONFIRM_WINDOW_MINUTES * 60_000);
    const { error: mErr } = await supabaseAdmin.from("matches").update({
      status: "awaiting_confirmation",
      end_time: now.toISOString(),
      completion_note: data.completionNote ?? null,
      confirm_deadline_at: deadline.toISOString(),
    }).eq("id", match.id);
    if (mErr) throw new Error(mErr.message);
    // request.status は in_progress のまま。UI は match.status で判定する
    return { ok: true, deadline: deadline.toISOString() };
  });

// 依頼者: 受け取り確認 → 決済確定
export const confirmCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: req } = await context.supabase
      .from("requests").select("customer_id, status").eq("id", data.requestId).maybeSingle();
    if (!req) throw new Error("Request not found");
    const { data: isAdmin } = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "admin" }) as { data: boolean | null };
    if (!isAdmin && req.customer_id !== context.userId) throw new Error("Forbidden");

    const capture = await _captureAuthorized(data.requestId);
    await supabaseAdmin.from("matches").update({
      status: "completed",
      confirmed_at: new Date().toISOString(),
    }).eq("request_id", data.requestId);
    await supabaseAdmin.from("requests").update({ status: "completed" }).eq("id", data.requestId);
    return { ok: true, ...capture };
  });

// 依頼者: 異議申立
export const disputeCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string; reason: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const reason = (data.reason ?? "").trim();
    if (reason.length < 5) throw new Error("異議の内容を5文字以上で入力してください");
    const { data: req } = await context.supabase
      .from("requests").select("customer_id, store_name, request_number").eq("id", data.requestId).maybeSingle();
    if (!req) throw new Error("Request not found");
    if (req.customer_id !== context.userId) throw new Error("Forbidden");

    await supabaseAdmin.from("matches").update({
      status: "disputed",
      dispute_reason: reason,
      disputed_at: new Date().toISOString(),
    }).eq("request_id", data.requestId);
    await supabaseAdmin.rpc("notify_admin", {
      p_kind: "dispute_filed",
      p_severity: "alert",
      p_title: `異議申立: ${req.store_name}`,
      p_body: `#${String(req.request_number ?? "").padStart(4, "0")} に異議申立が届きました`,
      p_request_id: data.requestId,
      p_actor_id: context.userId,
      p_details: { reason },
    });
    return { ok: true };
  });

// 期限切れの受け取り確認を自動確定（cron から呼ぶ）
export const autoConfirmExpired = createServerFn({ method: "POST" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    const { data: rows } = await supabaseAdmin
      .from("matches")
      .select("id, request_id, confirm_deadline_at")
      .eq("status", "awaiting_confirmation")
      .lte("confirm_deadline_at", nowIso);
    let processed = 0;
    for (const m of rows ?? []) {
      if (!m.request_id) continue;
      try {
        await _captureAuthorized(m.request_id);
        await supabaseAdmin.from("matches").update({
          status: "completed",
          confirmed_at: nowIso,
          auto_confirmed: true,
        }).eq("id", m.id);
        await supabaseAdmin.from("requests").update({ status: "completed" }).eq("id", m.request_id);
        processed++;
      } catch (e) {
        console.error("auto-confirm failed", m.id, e);
      }
    }
    return { processed, scanned: (rows ?? []).length };
  });

// 希望日時を超過した未マッチ依頼（open）を自動キャンセル
// 猶予: desired_time + OVERDUE_GRACE_MINUTES を経過したものが対象
export const OVERDUE_GRACE_MINUTES = 30;

export const autoCancelOverdueRequests = createServerFn({ method: "POST" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cutoff = new Date(Date.now() - OVERDUE_GRACE_MINUTES * 60 * 1000).toISOString();
    const { data: rows } = await supabaseAdmin
      .from("requests")
      .select("id, customer_id, store_name, request_number, desired_time")
      .eq("status", "open")
      .not("desired_time", "is", null)
      .lt("desired_time", cutoff);
    let canceled = 0;
    for (const r of rows ?? []) {
      const { error } = await supabaseAdmin
        .from("requests")
        .update({ status: "canceled" })
        .eq("id", r.id)
        .eq("status", "open");
      if (error) {
        console.error("auto-cancel overdue failed", r.id, error);
        continue;
      }
      canceled++;
      await supabaseAdmin.rpc("notify_admin", {
        p_kind: "request_auto_canceled_overdue",
        p_severity: "warn",
        p_title: `希望時刻超過で自動キャンセル: ${r.store_name}`,
        p_body: `#${String(r.request_number ?? "").padStart(4, "0")} が希望時刻超過(${OVERDUE_GRACE_MINUTES}分)で自動キャンセルされました`,
        p_request_id: r.id,
        p_actor_id: r.customer_id,
        p_details: { desired_time: r.desired_time, grace_minutes: OVERDUE_GRACE_MINUTES },
      });
    }
    return { scanned: (rows ?? []).length, canceled };
  });

// 放置マッチの強制完了（希望日時 + ABANDON_HOURS 経過しても完了/紛争になっていないもの）
// 顧客請求は void（¥0）、代行者報酬も¥0。
export const ABANDON_HOURS = 2;

export const autoForceCompleteAbandoned = createServerFn({ method: "POST" })
  .handler(async () => {
    const { getStripe, ensureWalletDomains } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stripe = getStripe();
    const cutoffIso = new Date(Date.now() - ABANDON_HOURS * 60 * 60 * 1000).toISOString();

    const activeStatuses = ["approved", "in_progress", "arrived", "awaiting_confirmation"] as const;
    const { data: allRows } = await supabaseAdmin
      .from("matches")
      .select("id, request_id, worker_id, status, end_time, requests(id, status, desired_time, store_name, request_number, customer_id)")
      .in("status", activeStatuses);
    const rows = (allRows ?? []).filter((m) => {
      const r = (m as unknown as { requests: { desired_time: string | null } | null }).requests;
      return r?.desired_time && r.desired_time < cutoffIso;
    });


    let processed = 0;
    for (const m of rows ?? []) {
      const req = (m as unknown as { requests: { id: string; store_name: string; request_number: number | null; customer_id: string; desired_time: string } }).requests;
      if (!req) continue;
      try {
        const { data: pays } = await supabaseAdmin
          .from("payments").select("*").eq("request_id", req.id)
          .in("status", ["authorized", "pending"]);
        for (const p of pays ?? []) {
          let voided = !p.stripe_payment_intent_id;
          if (p.stripe_payment_intent_id) {
            try {
              await stripe.paymentIntents.cancel(p.stripe_payment_intent_id);
              voided = true;
            } catch (e) {
              console.error("void on force-complete failed", p.id, e);
            }
          }
          if (voided) {
            await supabaseAdmin.from("payments").update({
              status: "canceled",
              platform_fee: 0,
              worker_payout: 0,
            }).eq("id", p.id);
          }
        }

        const nowIso = new Date().toISOString();
        const existingEnd = (m as unknown as { end_time?: string | null }).end_time ?? null;
        await supabaseAdmin.from("matches").update({
          status: "completed",
          confirmed_at: nowIso,
          auto_confirmed: true,
          force_completed_at: nowIso,
          force_completion_reason: `希望日時から${ABANDON_HOURS}時間経過しても完了報告がなく、放置案件として強制完了（報酬¥0）`,
          end_time: existingEnd ?? nowIso,
        }).eq("id", m.id);
        await supabaseAdmin.from("requests").update({ status: "completed", total_fee: 0 }).eq("id", req.id);
        await supabaseAdmin.from("payments").update({ platform_fee: 0, worker_payout: 0 })
          .eq("request_id", req.id)
          .eq("status", "canceled");

        await supabaseAdmin.rpc("notify_admin", {
          p_kind: "match_force_completed_abandoned",
          p_severity: "alert",
          p_title: `放置案件を強制完了: ${req.store_name}`,
          p_body: `#${String(req.request_number ?? "").padStart(4, "0")} が希望日時+${ABANDON_HOURS}h経過で強制完了(報酬¥0)されました`,
          p_request_id: req.id,
          p_actor_id: (m as unknown as { worker_id: string }).worker_id,
          p_details: { desired_time: req.desired_time, abandon_hours: ABANDON_HOURS, previous_match_status: (m as unknown as { status: string }).status },
        });
        processed++;
      } catch (e) {
        console.error("auto-force-complete failed", m.id, e);
      }
    }
    return { scanned: (rows ?? []).length, processed };
  });


