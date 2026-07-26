import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logJson } from "@/lib/log-schema";
import {
  GENERIC_ERROR,
  SETUP_ERROR,
  FORBIDDEN_ERROR,
  INVALID_INPUT_ERROR,
  LinkInputSchema,
  assertWorkerRole,
  buildAbsoluteUrl,
  createReplacementConnectAccount,
  createStripeConnectAccount,
  ensureConnectAccountBranding,
  getAccountPrefillEmail,
  shouldReplaceForNetworkedOnboarding,
  writeAudit,
  type StripeErr,
} from "@/lib/stripe-connect.server";

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

    let accountId: string;
    try {
      const email = await getAccountPrefillEmail(supabaseAdmin, userId);
      const account = await createStripeConnectAccount(stripe, userId, email, `connect-account:${userId}:networked-skip-v1`);
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
    if (!profile?.stripe_account_id && !data.accountId) {
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
      let accountId = data.accountId ?? profile.stripe_account_id;
      if (!accountId) {
        return { url: null, error: "先に受取口座を作成してください。" };
      }
      try {
        const existing = await ensureConnectAccountBranding(stripe, runId, userId, accountId);
        if (shouldReplaceForNetworkedOnboarding(existing)) {
          const replacement = await createReplacementConnectAccount(stripe, supabaseAdmin, userId);
          const { error: replaceErr } = await supabaseAdmin
            .from("profiles")
            .update({ stripe_account_id: replacement.id, stripe_account_ready: false })
            .eq("id", userId);
          if (replaceErr) throw replaceErr;
          await writeAudit(supabaseAdmin, userId, "connect.account_replaced", {
            runId, oldAccountId: accountId, accountId: replacement.id,
          });
          logJson("info", "connect.account_replaced", {
            runId, userId, oldAccountId: accountId, accountId: replacement.id,
          });
          accountId = replacement.id;
        }
      } catch (updateErr) {
        logJson("warn", "connect.account_update_skipped", {
          runId, userId, accountId,
          message: (updateErr as StripeErr).message ?? "unknown",
        });
      }

      const link = await stripe.accountLinks.create({
        account: accountId,
        return_url: returnUrl,
        refresh_url: refreshUrl,
        type: "account_onboarding",
      });
      await writeAudit(supabaseAdmin, userId, "connect.link_created", {
        runId, accountId,
      });
      logJson("info", "connect.link_created", {
        runId, userId, accountId, durationMs: Date.now() - started,
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
      const publishableKey = (process.env.STRIPE_LIVE_PUBLISHABLE_KEY ?? process.env.STRIPE_PUBLISHABLE_KEY ?? "").trim();
      const secretKeyIsLive = validation.key.startsWith("sk_live_");
      const publishableKeyIsTest = publishableKey.startsWith("pk_test_");
      if (secretKeyIsLive && publishableKeyIsTest) {
        logJson("warn", "connect.invalid_input", {
          runId,
          userId,
          action: "create_account_session",
          reason: "publishable_secret_mode_mismatch",
        });
        return {
          clientSecret: null,
          error: "Stripe公開キーがテスト用のままです。STRIPE_PUBLISHABLE_KEYをpk_live_で始まる本番公開キーに更新してください。",
        };
      }

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
