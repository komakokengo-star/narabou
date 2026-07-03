import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const stripeSetupError = "Stripe secret key is invalid. Please save a valid sk_test_ or sk_live_ key, then try again.";

export const createConnectAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getStripe, validateStripeSecretKey } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const validation = validateStripeSecretKey(process.env.STRIPE_SECRET_KEY);
    if (!validation.ok) return { accountId: null, error: stripeSetupError };
    const stripe = getStripe();

    const { data: profile } = await supabaseAdmin
      .from("profiles").select("*").eq("id", context.userId).maybeSingle();
    let accountId = profile?.stripe_account_id ?? null;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "JP",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      accountId = account.id;
      await supabaseAdmin.from("profiles").update({ stripe_account_id: accountId }).eq("id", context.userId);
    }
    return { accountId, error: null };
  });

export const createAccountLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { returnUrl: string; refreshUrl: string }) => d)
  .handler(async ({ data, context }) => {
    const { getStripe, validateStripeSecretKey } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const validation = validateStripeSecretKey(process.env.STRIPE_SECRET_KEY);
    if (!validation.ok) return { url: null, error: stripeSetupError };
    const stripe = getStripe();

    const { data: profile } = await supabaseAdmin
      .from("profiles").select("stripe_account_id").eq("id", context.userId).maybeSingle();
    if (!profile?.stripe_account_id) return { url: null, error: "Create account first" };

    const link = await stripe.accountLinks.create({
      account: profile.stripe_account_id,
      return_url: data.returnUrl,
      refresh_url: data.refreshUrl,
      type: "account_onboarding",
    });
    return { url: link.url, error: null };
  });

export const refreshConnectStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getStripe, validateStripeSecretKey } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const validation = validateStripeSecretKey(process.env.STRIPE_SECRET_KEY);
    if (!validation.ok) return { ready: false, error: stripeSetupError };
    const stripe = getStripe();

    const { data: profile } = await supabaseAdmin
      .from("profiles").select("stripe_account_id").eq("id", context.userId).maybeSingle();
    if (!profile?.stripe_account_id) return { ready: false, error: null };
    const acc = await stripe.accounts.retrieve(profile.stripe_account_id);
    const ready = !!acc.charges_enabled && !!acc.payouts_enabled;
    await supabaseAdmin.from("profiles").update({ stripe_account_ready: ready }).eq("id", context.userId);
    return { ready, error: null };
  });
