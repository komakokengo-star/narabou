import { describe, expect, it } from "vitest";
import { PRODUCTION_ORIGIN, resolveRedirectOrigin } from "@/lib/stripe-connect.server";

describe("resolveRedirectOrigin", () => {
  it("falls back to production for local dev origins", () => {
    expect(resolveRedirectOrigin("http://localhost:8080/api/public/connect/onboarding")).toBe(PRODUCTION_ORIGIN);
    expect(resolveRedirectOrigin("http://127.0.0.1:3000/x")).toBe(PRODUCTION_ORIGIN);
  });

  it("falls back to production for Lovable preview origins", () => {
    expect(resolveRedirectOrigin("https://id-preview--abc.lovable.app/api/public/connect/onboarding")).toBe(
      PRODUCTION_ORIGIN,
    );
    expect(resolveRedirectOrigin("https://narabou.lovable.app/x")).toBe(PRODUCTION_ORIGIN);
  });

  it("keeps the production custom domain origin", () => {
    expect(resolveRedirectOrigin("https://app.narabou.jp/api/public/connect/onboarding")).toBe("https://app.narabou.jp");
  });

  it("falls back on malformed URLs", () => {
    expect(resolveRedirectOrigin("not-a-url")).toBe(PRODUCTION_ORIGIN);
  });
});
