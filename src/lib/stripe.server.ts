// Server-only Stripe helpers. Import inside handlers only.
import Stripe from "stripe";

export function validateStripeSecretKey(key: string | undefined): { ok: true; key: string } | { ok: false; message: string } {
  const trimmed = key?.trim() ?? "";
  if (!trimmed) {
    return { ok: false, message: "Stripe secret key is not configured." };
  }
  if (trimmed.startsWith("pk_")) {
    return { ok: false, message: "Stripe publishable key is configured. Use a secret key that starts with sk_test_ or sk_live_." };
  }
  if (trimmed.startsWith("rk_")) {
    return { ok: false, message: "Stripe restricted key is configured. Use the full secret key that starts with sk_test_ or sk_live_." };
  }
  if (!trimmed.startsWith("sk_test_") && !trimmed.startsWith("sk_live_")) {
    return { ok: false, message: "Invalid Stripe secret key format. It must start with sk_test_ or sk_live_." };
  }
  if (trimmed.length < 20) {
    return { ok: false, message: "Stripe secret key appears incomplete. Copy the full secret key." };
  }
  return { ok: true, key: trimmed };
}

export function getStripe(): Stripe {
  const validation = validateStripeSecretKey(process.env.STRIPE_SECRET_KEY);
  if (!validation.ok) throw new Error(validation.message);
  return new Stripe(validation.key);
}
