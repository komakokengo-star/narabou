import { createServerFn } from "@tanstack/react-start";

export const getStripePublishableKey = createServerFn({ method: "GET" }).handler(async () => {
  return { key: process.env.STRIPE_PUBLISHABLE_KEY ?? "" };
});
