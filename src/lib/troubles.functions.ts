import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PLATFORM_RATE } from "@/lib/fees";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data: ok } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (!ok) throw new Error("Forbidden: admin only");
}

// 管理者による手動・部分返金（金額指定）
export const manualRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { paymentId: string; amount: number; reason?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { getStripe } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stripe = getStripe();

    const { data: p } = await supabaseAdmin
      .from("payments").select("*").eq("id", data.paymentId).maybeSingle();
    if (!p) throw new Error("Payment not found");
    if (!p.stripe_payment_intent_id) throw new Error("No Stripe intent");

    const remaining = p.amount - (p.refund_amount ?? 0);
    const amt = Math.min(Math.max(1, Math.floor(data.amount)), remaining);
    if (amt <= 0) throw new Error("返金可能額がありません");

    await stripe.refunds.create({
      payment_intent: p.stripe_payment_intent_id,
      amount: amt,
      metadata: { manual: "true", reason: data.reason ?? "" },
    });

    const newRefund = (p.refund_amount ?? 0) + amt;
    await supabaseAdmin.from("payments").update({
      refund_amount: newRefund,
      status: newRefund >= p.amount ? "refunded" : "partially_refunded",
    }).eq("id", p.id);

    return { refunded: amt };
  });

// 差し戻し: 依頼を再募集状態に戻し、マッチング解除
export const revertRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string; reason?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("matches").delete().eq("request_id", data.requestId);
    const { error } = await supabaseAdmin.from("requests").update({
      status: "open",
    }).eq("id", data.requestId);
    if (error) throw error;
    return { ok: true };
  });

// 任意のステータスへの手動変更
export const setRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string; status: "open" | "matched" | "arrived" | "in_progress" | "completed" | "canceled" }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("requests").update({
      status: data.status,
    }).eq("id", data.requestId);
    if (error) throw error;
    return { ok: true };
  });

// 手動承認: Stripe確認できない場合に管理者が支払い済としてマーク
export const manualMarkPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { paymentId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p } = await supabaseAdmin
      .from("payments").select("*").eq("id", data.paymentId).maybeSingle();
    if (!p) throw new Error("Payment not found");
    const platformFee = p.platform_fee || Math.round(p.amount * PLATFORM_RATE);
    const workerPayout = p.worker_payout || p.amount - platformFee;
    const { error } = await supabaseAdmin.from("payments").update({
      status: "paid",
      platform_fee: platformFee,
      worker_payout: workerPayout,
    }).eq("id", data.paymentId);
    if (error) throw error;
    return { ok: true };
  });

// 失敗としてマーク
export const manualMarkFailed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { paymentId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("payments").update({
      status: "failed",
    }).eq("id", data.paymentId);
    if (error) throw error;
    return { ok: true };
  });
