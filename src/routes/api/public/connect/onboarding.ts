import { createFileRoute } from "@tanstack/react-router";
import { logJson } from "@/lib/log-schema";

type StripeLikeError = { message?: string; code?: string; type?: string };

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.split(".").length === 3 ? token : null;
}

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export const Route = createFileRoute("/api/public/connect/onboarding")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const runId = crypto.randomUUID();
        const started = Date.now();
        const token = getBearerToken(request);
        if (!token) return json({ error: "ログイン状態を確認できません。再ログインしてください。" }, 401);

        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return json({ error: "決済サービスの設定が未完了です。管理者にお問い合わせください。" }, 500);
        }

        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: {
            fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
            headers: { Authorization: `Bearer ${token}` },
          },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });

        const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
        const userId = claimsData?.claims?.sub;
        if (claimsError || !userId) {
          return json({ error: "ログイン状態を確認できません。再ログインしてください。" }, 401);
        }

        logJson("info", "connect.request", { runId, userId, action: "onboarding_redirect" });

        const {
          GENERIC_ERROR,
          SETUP_ERROR,
          FORBIDDEN_ERROR,
          INVALID_INPUT_ERROR,
          LinkInputSchema,
          assertWorkerRole,
          createReplacementConnectAccount,
          createStripeConnectAccount,
          ensureConnectAccountBranding,
          getAccountPrefillEmail,
          shouldReplaceForNetworkedOnboarding,
          writeAudit,
        } = await import("@/lib/stripe-connect.server");

        const body = await request.json().catch(() => ({}));
        const input = LinkInputSchema.safeParse({
          returnPath: typeof body?.returnPath === "string" ? body.returnPath : "/worker?payout=ready",
          refreshPath: typeof body?.refreshPath === "string" ? body.refreshPath : "/worker?payout=refresh",
          accountId: typeof body?.accountId === "string" ? body.accountId : undefined,
        });

        if (!input.success) {
          logJson("warn", "connect.invalid_input", {
            runId,
            userId,
            action: "onboarding_redirect",
            reason: "schema_parse_failed",
          });
          return json({ error: INVALID_INPUT_ERROR }, 400);
        }

        if (!(await assertWorkerRole(supabase, userId))) {
          logJson("warn", "connect.forbidden", {
            runId,
            userId,
            action: "onboarding_redirect",
            reason: "not_worker_role",
          });
          return json({ error: FORBIDDEN_ERROR }, 403);
        }

        const { getStripe, validateConfiguredStripeSecretKey, getConfiguredStripeSecretKeyDiagnostic } = await import("@/lib/stripe.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const validation = validateConfiguredStripeSecretKey();
        if (!validation.ok) {
          logJson("error", "connect.stripe_error", {
            runId,
            userId,
            action: "onboarding_redirect",
            message: "invalid_secret_key",
            diagnostic: getConfiguredStripeSecretKeyDiagnostic(),
          });
          return json({ error: SETUP_ERROR }, 500);
        }

        const stripe = getStripe();
        const { data: profile, error: profileErr } = await supabaseAdmin
          .from("profiles")
          .select("stripe_account_id")
          .eq("id", userId)
          .maybeSingle();

        if (profileErr) {
          logJson("error", "connect.db_error", {
            runId,
            userId,
            stage: "profiles.select",
            message: profileErr.message,
            code: profileErr.code ?? "unknown",
          });
          return json({ error: GENERIC_ERROR }, 500);
        }

        let accountId = input.data.accountId ?? profile?.stripe_account_id ?? null;
        if (!accountId) {
          try {
            const email = await getAccountPrefillEmail(supabaseAdmin, userId);
            const account = await createStripeConnectAccount(stripe, userId, email, `connect-account:${userId}:networked-skip-v1`);
            accountId = account.id;
          } catch (e) {
            const se = e as StripeLikeError;
            logJson("error", "connect.stripe_error", {
              runId,
              userId,
              action: "create_account",
              message: se.message ?? "unknown",
              code: se.code ?? "unknown",
              stripeType: se.type ?? "unknown",
            });
            return json({ error: GENERIC_ERROR }, 500);
          }

          const { error: updateErr } = await supabaseAdmin
            .from("profiles")
            .update({ stripe_account_id: accountId, stripe_account_ready: false })
            .eq("id", userId);
          if (updateErr) {
            logJson("error", "connect.db_error", {
              runId,
              userId,
              stage: "profiles.update",
              message: updateErr.message,
              code: updateErr.code ?? "unknown",
            });
            return json({ error: GENERIC_ERROR }, 500);
          }

          await writeAudit(supabaseAdmin, userId, "connect.account_created", { runId, accountId });
          logJson("info", "connect.account_created", {
            runId,
            userId,
            accountId,
            durationMs: Date.now() - started,
          });
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
              runId,
              oldAccountId: accountId,
              accountId: replacement.id,
            });
            logJson("info", "connect.account_replaced", {
              runId,
              userId,
              oldAccountId: accountId,
              accountId: replacement.id,
            });
            accountId = replacement.id;
          }
        } catch (e) {
          logJson("warn", "connect.account_update_skipped", {
            runId,
            userId,
            accountId,
            message: (e as StripeLikeError).message ?? "unknown",
          });
        }

        try {
          const requestOrigin = new URL(request.url).origin;
          // Stripe livemode rejects localhost redirect URLs (dev/preview sandbox),
          // so fall back to the public production origin.
          const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(requestOrigin);
          const origin = isLocal ? "https://app.narabou.jp" : requestOrigin;
          const link = await stripe.accountLinks.create({
            account: accountId,
            return_url: `${origin}${input.data.returnPath}`,
            refresh_url: `${origin}${input.data.refreshPath}`,
            type: "account_onboarding",
          });
          await writeAudit(supabaseAdmin, userId, "connect.link_created", { runId, accountId });
          logJson("info", "connect.link_created", {
            runId,
            userId,
            accountId,
            durationMs: Date.now() - started,
          });
          return json({ url: link.url, error: null });
        } catch (e) {
          const se = e as StripeLikeError;
          logJson("error", "connect.stripe_error", {
            runId,
            userId,
            action: "create_link",
            message: se.message ?? "unknown",
            code: se.code ?? "unknown",
            stripeType: se.type ?? "unknown",
          });
          return json({ error: GENERIC_ERROR }, 500);
        }
      },
    },
  },
});