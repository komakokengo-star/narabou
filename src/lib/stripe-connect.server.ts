import { getRequestHeader, getRequestHost } from "@tanstack/react-start/server";
import { z } from "zod";
import type Stripe from "stripe";

import { logJson } from "@/lib/log-schema";

export const GENERIC_ERROR = "受取口座の設定でエラーが発生しました。時間をおいて再度お試しください。";
export const SETUP_ERROR = "決済サービスの設定が未完了です。管理者にお問い合わせください。";
export const FORBIDDEN_ERROR = "この操作は代行者ロールのユーザーのみ実行できます。";
export const INVALID_INPUT_ERROR = "リダイレクト先の指定が不正です。";

const PLATFORM_DISPLAY_NAME = "NARABOU";
const PLATFORM_URL = "https://app.narabou.jp";
const ONBOARDING_VERSION = "networked-skip-v1";

export const PathSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^\/[A-Za-z0-9_\-./?=&%]*$/, "path must start with / and contain only URL-safe chars")
  .refine((p) => !p.startsWith("//"), "protocol-relative path is not allowed")
  .refine((p) => !p.includes(".."), "path traversal is not allowed");

export const LinkInputSchema = z.object({
  returnPath: PathSchema,
  refreshPath: PathSchema,
  accountId: z.string().regex(/^acct_[A-Za-z0-9]+$/).optional(),
});

export type StripeErr = { message?: string; code?: string; type?: string };

type SupabaseLike = { rpc: unknown };

type SupabaseAdminLike = {
  from: (table: string) => unknown;
  auth?: {
    admin?: {
      getUserById: (userId: string) => Promise<{ data?: { user?: { email?: string | null } | null }; error?: unknown }>;
    };
  };
};

export async function assertWorkerRole(supabase: SupabaseLike, userId: string): Promise<boolean> {
  const rpc = supabase.rpc as (
    fn: "has_role",
    args: { _user_id: string; _role: "worker" },
  ) => Promise<{ data: unknown; error: unknown }>;
  const { data, error } = await rpc("has_role", { _user_id: userId, _role: "worker" });
  if (error) return false;
  return data === true;
}

export function buildAbsoluteUrl(path: string): string {
  const host = getRequestHost();
  const proto = getRequestHeader("x-forwarded-proto") ?? "https";
  return `${proto}://${host}${path}`;
}

export async function writeAudit(
  admin: SupabaseAdminLike,
  actorId: string,
  action: string,
  details: Record<string, unknown>,
) {
  const fromResult = admin.from("audit_logs") as {
    insert: (value: Record<string, unknown>) => Promise<unknown>;
  };
  await fromResult.insert({
    actor_id: actorId,
    action,
    target_type: "stripe_connect_account",
    target_id: null,
    details,
  });
}

export async function getAccountPrefillEmail(admin: SupabaseAdminLike, userId: string): Promise<string | undefined> {
  try {
    const result = await admin.auth?.admin?.getUserById(userId);
    return result?.data?.user?.email?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function createStripeConnectAccount(
  stripe: Stripe,
  userId: string,
  email: string | undefined,
  idempotencyKey: string,
): Promise<Stripe.Account> {
  const params: Stripe.AccountCreateParams = {
    type: "express",
    country: "JP",
    business_type: "individual",
    business_profile: {
      name: PLATFORM_DISPLAY_NAME,
      url: PLATFORM_URL,
      product_description: "行列・順番待ち代行サービスの報酬受け取り",
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      app_user_id: userId,
      onboarding_version: ONBOARDING_VERSION,
    },
  };

  if (email) {
    params.individual = { email };
  }

  return stripe.accounts.create(params, { idempotencyKey });
}

export async function ensureConnectAccountBranding(
  stripe: Stripe,
  runId: string,
  userId: string,
  accountId: string,
): Promise<Stripe.Account> {
  const account = await stripe.accounts.retrieve(accountId);
  const currentName = account.business_profile?.name ?? "";
  const needsBrandingUpdate =
    !currentName || currentName.toLowerCase().includes("lovable") || currentName.toLowerCase().includes("dev");

  if (!needsBrandingUpdate) return account;

  const updated = await stripe.accounts.update(accountId, {
    business_profile: { name: PLATFORM_DISPLAY_NAME, url: PLATFORM_URL },
  });
  logJson("info", "connect.account_branding_updated", { runId, userId, accountId });
  return updated;
}

export function shouldReplaceForNetworkedOnboarding(account: Stripe.Account): boolean {
  if (account.details_submitted || account.charges_enabled || account.payouts_enabled) return false;
  return account.metadata?.onboarding_version !== ONBOARDING_VERSION;
}

export async function createReplacementConnectAccount(
  stripe: Stripe,
  admin: SupabaseAdminLike,
  userId: string,
): Promise<Stripe.Account> {
  const email = await getAccountPrefillEmail(admin, userId);
  return createStripeConnectAccount(stripe, userId, email, `connect-account:${userId}:${ONBOARDING_VERSION}`);
}