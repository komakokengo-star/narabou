import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createConnectAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getStripe } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
    return { accountId };
  });

export const createAccountLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { returnUrl: string; refreshUrl: string }) => d)
  .handler(async ({ data, context }) => {
    const { getStripe } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stripe = getStripe();

    const { data: profile } = await supabaseAdmin
      .from("profiles").select("stripe_account_id").eq("id", context.userId).maybeSingle();
    if (!profile?.stripe_account_id) throw new Error("Create account first");

    const link = await stripe.accountLinks.create({
      account: profile.stripe_account_id,
      return_url: data.returnUrl,
      refresh_url: data.refreshUrl,
      type: "account_onboarding",
    });
    return { url: link.url };
  });

export const refreshConnectStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getStripe } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stripe = getStripe();

    const { data: profile } = await supabaseAdmin
      .from("profiles").select("stripe_account_id").eq("id", context.userId).maybeSingle();
    if (!profile?.stripe_account_id) return { ready: false };
    const acc = await stripe.accounts.retrieve(profile.stripe_account_id);
    const ready = !!acc.charges_enabled && !!acc.payouts_enabled;
    await supabaseAdmin.from("profiles").update({ stripe_account_ready: ready }).eq("id", context.userId);
    return { ready };
  });
