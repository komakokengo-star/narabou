// Server-only Stripe helpers. Import inside handlers only.
import Stripe from "stripe";

function normalizeStripeSecretKey(key: string | undefined): string {
  let value = key?.trim() ?? "";

  // Secure forms sometimes receive an env-style paste such as
  // STRIPE_SECRET_KEY=sk_test_..., STRIPE_LIVE_API_KEY=sk_live_...
  // or export STRIPE_SECRET_KEY="sk_test_...".
  // Normalize those common forms without ever logging the raw value.
  value = value.replace(/^export\s+/i, "").trim();
  const envAssignment = value.match(/^(?:STRIPE_SECRET_KEY|STRIPE_LIVE_API_KEY|stripe_secret_key|stripe_live_api_key)\s*=\s*(.+)$/);
  if (envAssignment) value = envAssignment[1].trim();

  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
    || (value.startsWith("`") && value.endsWith("`"))
  ) {
    value = value.slice(1, -1).trim();
  }

  // If the secure field received surrounding text (JSON, shell command,
  // dashboard copy with labels, etc.), extract only the Stripe secret token.
  const embeddedSecret = value.match(/sk_(?:test|live)_[A-Za-z0-9_]+/);
  if (embeddedSecret) value = embeddedSecret[0];

  return value;
}

export function getStripeSecretKeyDiagnostic(key: string | undefined): {
  configured: boolean;
  reason: "ok" | "missing" | "publishable_key" | "restricted_key" | "bad_prefix" | "too_short";
  lengthBucket: "empty" | "short" | "medium" | "long";
  containsSecretToken: boolean;
} {
  const raw = key?.trim() ?? "";
  const normalized = normalizeStripeSecretKey(key);
  const lengthBucket = !raw ? "empty" : raw.length < 20 ? "short" : raw.length < 80 ? "medium" : "long";
  if (!normalized) {
    return { configured: false, reason: "missing", lengthBucket, containsSecretToken: false };
  }
  if (normalized.startsWith("pk_")) {
    return { configured: true, reason: "publishable_key", lengthBucket, containsSecretToken: false };
  }
  if (normalized.startsWith("rk_")) {
    return { configured: true, reason: "restricted_key", lengthBucket, containsSecretToken: false };
  }
  if (!normalized.startsWith("sk_test_") && !normalized.startsWith("sk_live_")) {
    return {
      configured: true,
      reason: "bad_prefix",
      lengthBucket,
      containsSecretToken: /sk_(?:test|live)_[A-Za-z0-9_]+/.test(raw),
    };
  }
  if (normalized.length < 20) {
    return { configured: true, reason: "too_short", lengthBucket, containsSecretToken: true };
  }
  return { configured: true, reason: "ok", lengthBucket, containsSecretToken: true };
}

export function validateStripeSecretKey(key: string | undefined): { ok: true; key: string } | { ok: false; message: string } {
  const trimmed = normalizeStripeSecretKey(key);
  if (!trimmed) {
    return { ok: false, message: "Stripe のシークレットキーが設定されていません。" };
  }
  if (trimmed.startsWith("pk_")) {
    return { ok: false, message: "Stripe の公開可能キーが設定されています。sk_test_ または sk_live_ で始まるシークレットキーを設定してください。" };
  }
  if (trimmed.startsWith("rk_")) {
    return { ok: false, message: "Stripe の制限付きキーが設定されています。sk_test_ または sk_live_ で始まる完全なシークレットキーを設定してください。" };
  }
  if (!trimmed.startsWith("sk_test_") && !trimmed.startsWith("sk_live_")) {
    return { ok: false, message: "Stripe シークレットキーの形式が正しくありません。sk_test_ または sk_live_ で始まる必要があります。" };
  }
  if (trimmed.length < 20) {
    return { ok: false, message: "Stripe シークレットキーが不完全なようです。キー全体をコピーして設定してください。" };
  }
  return { ok: true, key: trimmed };
}

function getConfiguredStripeSecretKey(): string | undefined {
  const liveKeyValidation = validateStripeSecretKey(process.env.STRIPE_LIVE_API_KEY);
  if (liveKeyValidation.ok) return liveKeyValidation.key;

  const legacyKeyValidation = validateStripeSecretKey(process.env.STRIPE_SECRET_KEY);
  if (legacyKeyValidation.ok) return legacyKeyValidation.key;

  return process.env.STRIPE_LIVE_API_KEY ?? process.env.STRIPE_SECRET_KEY;
}

export function getConfiguredStripeSecretKeyDiagnostic(): ReturnType<typeof getStripeSecretKeyDiagnostic> & {
  source: "STRIPE_LIVE_API_KEY" | "STRIPE_SECRET_KEY" | "none";
} {
  const liveKeyValidation = validateStripeSecretKey(process.env.STRIPE_LIVE_API_KEY);
  if (liveKeyValidation.ok) {
    return { ...getStripeSecretKeyDiagnostic(process.env.STRIPE_LIVE_API_KEY), source: "STRIPE_LIVE_API_KEY" };
  }

  const legacyKeyValidation = validateStripeSecretKey(process.env.STRIPE_SECRET_KEY);
  if (legacyKeyValidation.ok) {
    return { ...getStripeSecretKeyDiagnostic(process.env.STRIPE_SECRET_KEY), source: "STRIPE_SECRET_KEY" };
  }

  if (process.env.STRIPE_LIVE_API_KEY) {
    return { ...getStripeSecretKeyDiagnostic(process.env.STRIPE_LIVE_API_KEY), source: "STRIPE_LIVE_API_KEY" };
  }

  if (process.env.STRIPE_SECRET_KEY) {
    return { ...getStripeSecretKeyDiagnostic(process.env.STRIPE_SECRET_KEY), source: "STRIPE_SECRET_KEY" };
  }

  return { ...getStripeSecretKeyDiagnostic(undefined), source: "none" };
}

export function validateConfiguredStripeSecretKey(): { ok: true; key: string } | { ok: false; message: string } {
  return validateStripeSecretKey(getConfiguredStripeSecretKey());
}

export function getStripe(): Stripe {
  const validation = validateConfiguredStripeSecretKey();
  if (!validation.ok) throw new Error(validation.message);
  return new Stripe(validation.key);
}

// Apple Pay / Google Pay など、ウォレットをPayment Elementに表示するには
// 決済ドメインをStripeに登録しておく必要がある。初回呼び出し時に一度だけ登録する。
const registeredWalletDomains = new Set<string>();

export async function ensureWalletDomainRegistered(stripe: Stripe, domain: string): Promise<void> {
  const host = domain.trim().toLowerCase();
  if (!host || host.startsWith("localhost") || registeredWalletDomains.has(host)) return;
  registeredWalletDomains.add(host);
  try {
    const existing = await stripe.paymentMethodDomains.list({ domain_name: host, limit: 1 });
    if (existing.data.length > 0) {
      if (!existing.data[0].enabled) {
        await stripe.paymentMethodDomains.update(existing.data[0].id, { enabled: true });
      }
      return;
    }
    await stripe.paymentMethodDomains.create({ domain_name: host, enabled: true });
  } catch (error) {
    // 登録できなくてもカード決済は継続できるため、失敗は握りつぶす
    registeredWalletDomains.delete(host);
    console.warn("wallet domain registration skipped", host, (error as Error).message);
  }
}

const WALLET_DOMAINS = ["app.narabou.jp", "narabou.lovable.app"];

export async function ensureWalletDomains(stripe: Stripe): Promise<void> {
  await Promise.all(WALLET_DOMAINS.map((domain) => ensureWalletDomainRegistered(stripe, domain)));
}
