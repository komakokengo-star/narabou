import { createServerFn } from "@tanstack/react-start";

export const getStripePublishableKey = createServerFn({ method: "GET" }).handler(async () => {
  const normalizePublishableKey = (key: string | undefined): string => {
    let value = key?.trim() ?? "";
    value = value.replace(/^export\s+/i, "").trim();
    const assignment = value.match(/^(?:STRIPE_PUBLISHABLE_KEY|STRIPE_LIVE_PUBLISHABLE_KEY|STRIPE_TEST_PUBLISHABLE_KEY|stripe_publishable_key|stripe_live_publishable_key|stripe_test_publishable_key)\s*=\s*(.+)$/);
    if (assignment) value = assignment[1].trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
      || (value.startsWith("`") && value.endsWith("`"))
    ) {
      value = value.slice(1, -1).trim();
    }
    const embedded = value.match(/pk_(?:test|live)_[A-Za-z0-9_]+/);
    return embedded ? embedded[0] : value;
  };

  const { validateConfiguredStripeSecretKey } = await import("@/lib/stripe.server");
  const secret = validateConfiguredStripeSecretKey();
  const wantsLive = secret.ok && secret.key.startsWith("sk_live_");
  const wantsTest = secret.ok && secret.key.startsWith("sk_test_");
  const candidates = wantsLive
    ? [process.env.STRIPE_LIVE_PUBLISHABLE_KEY, process.env.STRIPE_PUBLISHABLE_KEY]
    : wantsTest
      ? [process.env.STRIPE_TEST_PUBLISHABLE_KEY, process.env.STRIPE_PUBLISHABLE_KEY]
      : [process.env.STRIPE_PUBLISHABLE_KEY, process.env.STRIPE_LIVE_PUBLISHABLE_KEY, process.env.STRIPE_TEST_PUBLISHABLE_KEY];

  const normalized = candidates.map(normalizePublishableKey).filter(Boolean);
  const matching = normalized.find((key) => (wantsLive && key.startsWith("pk_live_")) || (wantsTest && key.startsWith("pk_test_")));
  return { key: matching ?? normalized[0] ?? "" };
});
