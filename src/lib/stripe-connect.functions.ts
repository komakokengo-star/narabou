import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { logJson } from "@/lib/log-schema";
import { z } from "zod";

// クライアントに返す共通エラーメッセージ。Stripeの生エラーは絶対に返さない（内部詳細の漏えい防止）。
const GENERIC_ERROR = "受取口座の設定でエラーが発生しました。時間をおいて再度お試しください。";
const SETUP_ERROR = "決済サービスの設定が未完了です。管理者にお問い合わせください。";
const FORBIDDEN_ERROR = "この操作は代行者ロールのユーザーのみ実行できます。";
const INVALID_INPUT_ERROR = "リダイレクト先の指定が不正です。";

// リダイレクトURLはサーバーが自分の Host から組み立てる。クライアント指定はパスのみ許可し、
// 「/」で始まる相対パスに限定する（オープンリダイレクト / フィッシング防止）。
const PathSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^\/[A-Za-z0-9_\-./?=&%]*$/, "path must start with / and contain only URL-safe chars")
  .refine((p) => !p.startsWith("//"), "protocol-relative path is not allowed")
  .refine((p) => !p.includes(".."), "path traversal is not allowed");

const LinkInputSchema = z.object({
  returnPath: PathSchema,
  refreshPath: PathSchema,
});

type StripeErr = { message?: string; code?: string; type?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertWorkerRole(supabase: any, userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "worker" });
  if (error) return false;
  return data === true;
}

function buildAbsoluteUrl(path: string): string {
  const host = getRequestHost();
  const proto = getRequestHeader("x-forwarded-proto") ?? "https";
  // path は PathSchema で先頭スラッシュを保証済み
  return `${proto}://${host}${path}`;
}

async function writeAudit(
  admin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  actorId: string,
  action: string,
  details: Record<string, unknown>,
) {
  await admin.from("audit_logs").insert({
    actor_id: actorId,
    action,
    target_type: "stripe_connect_account",
    target_id: null,
    details: details as never,
  });
}

export const createConnectAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const runId = crypto.randomUUID();
    const userId = context.userId;
    const started = Date.now();
    logJson("info", "connect.request", { runId, userId, action: "create_account" });

    // 1) ロール検証: worker ロール以外は拒否
    if (!(await assertWorkerRole(context.supabase, userId))) {
      logJson("warn", "connect.forbidden", {
        runId, userId, action: "create_account", reason: "not_worker_role",
      });
      return { accountId: null, error: FORBIDDEN_ERROR };
    }

    // 2) Stripe キー検証（未設定・不正時は生エラーを外に出さない）
    const { getStripe, validateConfiguredStripeSecretKey, getConfiguredStripeSecretKeyDiagnostic } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const validation = validateConfiguredStripeSecretKey();
    if (!validation.ok) {
      logJson("error", "connect.stripe_error", {
        runId,
        userId,
        action: "create_account",
        message: "invalid_secret_key",
        diagnostic: getConfiguredStripeSecretKeyDiagnostic(),
      });
      return { accountId: null, error: SETUP_ERROR };
    }
    const stripe = getStripe();

    // 3) 既存アカウントがあれば再利用（Stripeアカウント重複作成を防止）
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles").select("stripe_account_id").eq("id", userId).maybeSingle();
    if (profileErr) {
      logJson("error", "connect.db_error", {
        runId, userId, stage: "profiles.select",
        message: profileErr.message, code: profileErr.code ?? "unknown",
      });
      return { accountId: null, error: GENERIC_ERROR };
    }
    if (profile?.stripe_account_id) {
      logJson("info", "connect.account_reused", {
        runId, userId, accountId: profile.stripe_account_id,
      });
      return { accountId: profile.stripe_account_id, error: null };
    }

    // 4) Stripe アカウント作成（idempotencyKey で二重作成を防止）
    let accountId: string;
    try {
      const account = await stripe.accounts.create(
        {
          type: "express",
          country: "JP",
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          metadata: { app_user_id: userId },
        },
        { idempotencyKey: `connect-account:${userId}` },
      );
      accountId = account.id;
    } catch (e) {
      const se = e as StripeErr;
      logJson("error", "connect.stripe_error", {
        runId, userId, action: "create_account",
        message: se.message ?? "unknown",
        code: se.code ?? "unknown",
        stripeType: se.type ?? "unknown",
      });
      return { accountId: null, error: GENERIC_ERROR };
    }

    // 5) profiles に紐付け
    const { error: updateErr } = await supabaseAdmin
      .from("profiles").update({ stripe_account_id: accountId }).eq("id", userId);
    if (updateErr) {
      logJson("error", "connect.db_error", {
        runId, userId, stage: "profiles.update",
        message: updateErr.message, code: updateErr.code ?? "unknown",
      });
      return { accountId: null, error: GENERIC_ERROR };
    }

    await writeAudit(supabaseAdmin, userId, "connect.account_created", {
      runId, accountId,
    });
    logJson("info", "connect.account_created", {
      runId, userId, accountId, durationMs: Date.now() - started,
    });
    return { accountId, error: null };
  });

export const createAccountLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LinkInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const runId = crypto.randomUUID();
    const userId = context.userId;
    const started = Date.now();
    logJson("info", "connect.request", { runId, userId, action: "create_link" });

    if (!(await assertWorkerRole(context.supabase, userId))) {
      logJson("warn", "connect.forbidden", {
        runId, userId, action: "create_link", reason: "not_worker_role",
      });
      return { url: null, error: FORBIDDEN_ERROR };
    }

    const { getStripe, validateConfiguredStripeSecretKey, getConfiguredStripeSecretKeyDiagnostic } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const validation = validateConfiguredStripeSecretKey();
    if (!validation.ok) {
      logJson("error", "connect.stripe_error", {
        runId,
        userId,
        action: "create_link",
        message: "invalid_secret_key",
        diagnostic: getConfiguredStripeSecretKeyDiagnostic(),
      });
      return { url: null, error: SETUP_ERROR };
    }
    const stripe = getStripe();

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles").select("stripe_account_id").eq("id", userId).maybeSingle();
    if (profileErr) {
      logJson("error", "connect.db_error", {
        runId, userId, stage: "profiles.select",
        message: profileErr.message, code: profileErr.code ?? "unknown",
      });
      return { url: null, error: GENERIC_ERROR };
    }
    if (!profile?.stripe_account_id) {
      logJson("warn", "connect.invalid_input", {
        runId, userId, action: "create_link", reason: "no_account_yet",
      });
      return { url: null, error: "先に受取口座を作成してください。" };
    }

    // オープンリダイレクト防止のためサーバー側でURLを構築
    let returnUrl: string;
    let refreshUrl: string;
    try {
      returnUrl = buildAbsoluteUrl(data.returnPath);
      refreshUrl = buildAbsoluteUrl(data.refreshPath);
    } catch {
      logJson("error", "connect.invalid_input", {
        runId, userId, action: "create_link", reason: "cannot_build_url",
      });
      return { url: null, error: INVALID_INPUT_ERROR };
    }

    try {
      const link = await stripe.accountLinks.create({
        account: profile.stripe_account_id,
        return_url: returnUrl,
        refresh_url: refreshUrl,
        type: "account_onboarding",
      });
      await writeAudit(supabaseAdmin, userId, "connect.link_created", {
        runId, accountId: profile.stripe_account_id,
      });
      logJson("info", "connect.link_created", {
        runId, userId, accountId: profile.stripe_account_id, durationMs: Date.now() - started,
      });
      return { url: link.url, error: null };
    } catch (e) {
      const se = e as StripeErr;
      logJson("error", "connect.stripe_error", {
        runId, userId, action: "create_link",
        message: se.message ?? "unknown",
        code: se.code ?? "unknown",
        stripeType: se.type ?? "unknown",
      });
      return { url: null, error: GENERIC_ERROR };
    }
  });

// Embedded Components 用: AccountSession のクライアントシークレットを発行
export const createConnectAccountSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const runId = crypto.randomUUID();
    const userId = context.userId;
    const started = Date.now();
    logJson("info", "connect.request", { runId, userId, action: "create_account_session" });

    if (!(await assertWorkerRole(context.supabase, userId))) {
      logJson("warn", "connect.forbidden", {
        runId, userId, action: "create_account_session", reason: "not_worker_role",
      });
      return { clientSecret: null, error: FORBIDDEN_ERROR };
    }

    const { getStripe, validateConfiguredStripeSecretKey, getConfiguredStripeSecretKeyDiagnostic } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const validation = validateConfiguredStripeSecretKey();
    if (!validation.ok) {
      logJson("error", "connect.stripe_error", {
        runId, userId, action: "create_account_session",
        message: "invalid_secret_key",
        diagnostic: getConfiguredStripeSecretKeyDiagnostic(),
      });
      return { clientSecret: null, error: SETUP_ERROR };
    }
    const stripe = getStripe();

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles").select("stripe_account_id").eq("id", userId).maybeSingle();
    if (profileErr) {
      logJson("error", "connect.db_error", {
        runId, userId, stage: "profiles.select",
        message: profileErr.message, code: profileErr.code ?? "unknown",
      });
      return { clientSecret: null, error: GENERIC_ERROR };
    }
    if (!profile?.stripe_account_id) {
      return { clientSecret: null, error: "先に受取口座を作成してください。" };
    }

    try {
      const session = await stripe.accountSessions.create({
        account: profile.stripe_account_id,
        components: {
          account_onboarding: { enabled: true },
        },
      });
      await writeAudit(supabaseAdmin, userId, "connect.account_session_created", {
        runId, accountId: profile.stripe_account_id,
      });
      logJson("info", "connect.account_session_created", {
        runId, userId, accountId: profile.stripe_account_id, durationMs: Date.now() - started,
      });
      return { clientSecret: session.client_secret, error: null };
    } catch (e) {
      const se = e as StripeErr;
      logJson("error", "connect.stripe_error", {
        runId, userId, action: "create_account_session",
        message: se.message ?? "unknown",
        code: se.code ?? "unknown",
        stripeType: se.type ?? "unknown",
      });
      return { clientSecret: null, error: GENERIC_ERROR };
    }
  });


export const refreshConnectStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const runId = crypto.randomUUID();
    const userId = context.userId;
    const started = Date.now();
    logJson("info", "connect.request", { runId, userId, action: "refresh_status" });

    if (!(await assertWorkerRole(context.supabase, userId))) {
      logJson("warn", "connect.forbidden", {
        runId, userId, action: "refresh_status", reason: "not_worker_role",
      });
      return { ready: false, error: FORBIDDEN_ERROR };
    }

    const { getStripe, validateConfiguredStripeSecretKey, getConfiguredStripeSecretKeyDiagnostic } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const validation = validateConfiguredStripeSecretKey();
    if (!validation.ok) {
      logJson("error", "connect.stripe_error", {
        runId,
        userId,
        action: "refresh_status",
        message: "invalid_secret_key",
        diagnostic: getConfiguredStripeSecretKeyDiagnostic(),
      });
      return { ready: false, error: SETUP_ERROR };
    }
    const stripe = getStripe();

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles").select("stripe_account_id").eq("id", userId).maybeSingle();
    if (profileErr) {
      logJson("error", "connect.db_error", {
        runId, userId, stage: "profiles.select",
        message: profileErr.message, code: profileErr.code ?? "unknown",
      });
      return { ready: false, error: GENERIC_ERROR };
    }
    if (!profile?.stripe_account_id) {
      return { ready: false, error: null };
    }

    let ready = false;
    try {
      const acc = await stripe.accounts.retrieve(profile.stripe_account_id);
      ready = !!acc.charges_enabled && !!acc.payouts_enabled;
    } catch (e) {
      const se = e as StripeErr;
      logJson("error", "connect.stripe_error", {
        runId, userId, action: "refresh_status",
        message: se.message ?? "unknown",
        code: se.code ?? "unknown",
        stripeType: se.type ?? "unknown",
      });
      return { ready: false, error: GENERIC_ERROR };
    }

    const { error: updateErr } = await supabaseAdmin
      .from("profiles").update({ stripe_account_ready: ready }).eq("id", userId);
    if (updateErr) {
      logJson("error", "connect.db_error", {
        runId, userId, stage: "profiles.update",
        message: updateErr.message, code: updateErr.code ?? "unknown",
      });
      return { ready: false, error: GENERIC_ERROR };
    }

    await writeAudit(supabaseAdmin, userId, "connect.status_refreshed", {
      runId, accountId: profile.stripe_account_id, ready,
    });
    logJson("info", "connect.status_refreshed", {
      runId, userId, accountId: profile.stripe_account_id, ready, durationMs: Date.now() - started,
    });
    return { ready, error: null };
  });

// 管理者向け: 全代行者のStripe Connectアカウント状態を取得
export type ConnectStatus = "not_started" | "in_progress" | "completed" | "error";
export type AdminConnectRow = {
  userId: string;
  accountId: string | null;
  status: ConnectStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  disabledReason: string | null;
  currentlyDue: string[];
  errorMessage: string | null;
};

export const adminListConnectStatuses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ rows: AdminConnectRow[]; error: string | null }> => {
    const runId = crypto.randomUUID();
    const userId = context.userId;
    logJson("info", "connect.request", { runId, userId, action: "admin_list_statuses" });

    // 管理者のみ
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (isAdmin !== true) {
      logJson("warn", "connect.forbidden", {
        runId, userId, action: "admin_list_statuses", reason: "not_admin",
      });
      return { rows: [], error: FORBIDDEN_ERROR };
    }

    const { getStripe, validateConfiguredStripeSecretKey } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const validation = validateConfiguredStripeSecretKey();
    if (!validation.ok) {
      return { rows: [], error: SETUP_ERROR };
    }
    const stripe = getStripe();

    // 全workerロールのユーザーIDを取得
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("user_id").eq("role", "worker");
    const ids = (roles ?? []).map((r) => r.user_id);
    if (ids.length === 0) return { rows: [], error: null };

    const { data: profiles } = await supabaseAdmin
      .from("profiles").select("id, stripe_account_id, stripe_account_ready").in("id", ids);

    const rows: AdminConnectRow[] = [];
    for (const p of profiles ?? []) {
      const accountId = p.stripe_account_id ?? null;
      if (!accountId) {
        rows.push({
          userId: p.id, accountId: null, status: "not_started",
          chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false,
          disabledReason: null, currentlyDue: [], errorMessage: null,
        });
        continue;
      }
      try {
        const acc = await stripe.accounts.retrieve(accountId);
        const chargesEnabled = !!acc.charges_enabled;
        const payoutsEnabled = !!acc.payouts_enabled;
        const detailsSubmitted = !!acc.details_submitted;
        const disabledReason = acc.requirements?.disabled_reason ?? null;
        const currentlyDue = (acc.requirements?.currently_due ?? []) as string[];
        const errors = (acc.requirements?.errors ?? []) as Array<{ reason?: string }>;
        let status: ConnectStatus;
        if (chargesEnabled && payoutsEnabled) status = "completed";
        else if (disabledReason || errors.length > 0) status = "error";
        else status = "in_progress";
        rows.push({
          userId: p.id, accountId, status,
          chargesEnabled, payoutsEnabled, detailsSubmitted,
          disabledReason, currentlyDue,
          errorMessage: errors[0]?.reason ?? null,
        });
      } catch (e) {
        const se = e as StripeErr;
        logJson("error", "connect.stripe_error", {
          runId, userId, action: "admin_list_statuses",
          message: se.message ?? "unknown", code: se.code ?? "unknown",
          stripeType: se.type ?? "unknown",
        });
        rows.push({
          userId: p.id, accountId, status: "error",
          chargesEnabled: false, payoutsEnabled: !!p.stripe_account_ready,
          detailsSubmitted: false, disabledReason: null, currentlyDue: [],
          errorMessage: "Stripeからのアカウント情報取得に失敗しました",
        });
      }
    }
    return { rows, error: null };
  });
