import { describe, it, expect } from "vitest";
import { CONNECT_LOG_SCHEMAS, ALL_LOG_SCHEMAS, validateLog } from "@/lib/log-schema";

const base = (event: string, fields: Record<string, unknown> = {}): Record<string, unknown> => ({
  ts: "2026-07-03T00:00:00.000Z",
  level: "info",
  event,
  ...fields,
});

describe("CONNECT_LOG_SCHEMAS", () => {
  it("declares every connect.* event used by stripe-connect.functions.ts", () => {
    expect(Object.keys(CONNECT_LOG_SCHEMAS).sort()).toEqual([
      "connect.account_created",
      "connect.account_reused",
      "connect.db_error",
      "connect.forbidden",
      "connect.invalid_input",
      "connect.link_created",
      "connect.request",
      "connect.status_refreshed",
      "connect.stripe_error",
    ]);
  });

  it("is merged into ALL_LOG_SCHEMAS", () => {
    for (const k of Object.keys(CONNECT_LOG_SCHEMAS)) {
      expect(ALL_LOG_SCHEMAS[k]).toBeDefined();
    }
  });
});

describe("validateLog - connect.* events", () => {
  it("connect.request passes minimally", () => {
    expect(validateLog(base("connect.request", {
      runId: "r", userId: "u", action: "create_account",
    }))).toEqual([]);
  });

  it("connect.account_created requires accountId & durationMs", () => {
    expect(validateLog(base("connect.account_created", {
      runId: "r", userId: "u", accountId: "acct_1", durationMs: 12,
    }))).toEqual([]);
    const missing = validateLog(base("connect.account_created", {
      runId: "r", userId: "u",
    }));
    expect(missing).toEqual(expect.arrayContaining([
      "missing required accountId", "missing required durationMs",
    ]));
  });

  it("connect.status_refreshed requires ready boolean", () => {
    expect(validateLog(base("connect.status_refreshed", {
      runId: "r", userId: "u", accountId: "acct_1", ready: true, durationMs: 5,
    }))).toEqual([]);
    const wrong = validateLog(base("connect.status_refreshed", {
      runId: "r", userId: "u", accountId: "acct_1", ready: "yes", durationMs: 5,
    }));
    expect(wrong).toContain("ready: expected boolean, got string");
  });

  it("connect.stripe_error accepts optional code & stripeType", () => {
    expect(validateLog(base("connect.stripe_error", {
      runId: "r", userId: "u", action: "create_link",
      message: "boom", code: "resource_missing", stripeType: "invalid_request_error",
    }))).toEqual([]);
  });

  it("connect.forbidden / invalid_input require reason", () => {
    expect(validateLog(base("connect.forbidden", {
      runId: "r", userId: "u", action: "create_account", reason: "not_worker_role",
    }))).toEqual([]);
    expect(validateLog(base("connect.invalid_input", {
      runId: "r", userId: "u", action: "create_link", reason: "cannot_build_url",
    }))).toEqual([]);
  });

  it("connect.db_error accepts optional code", () => {
    expect(validateLog(base("connect.db_error", {
      runId: "r", userId: "u", stage: "profiles.select", message: "x", code: "PGRST",
    }))).toEqual([]);
  });
});

// リダイレクトパスのバリデーション（stripe-connect.functions.ts の PathSchema と対応）
import { z } from "zod";
const PathSchema = z
  .string().min(1).max(256)
  .regex(/^\/[A-Za-z0-9_\-./?=&%]*$/)
  .refine((p) => !p.startsWith("//"))
  .refine((p) => !p.includes(".."));

describe("PathSchema (redirect path validator)", () => {
  it("accepts app-relative paths", () => {
    expect(PathSchema.safeParse("/worker?payout=ready").success).toBe(true);
    expect(PathSchema.safeParse("/worker").success).toBe(true);
  });

  it("rejects absolute / cross-origin URLs (open redirect)", () => {
    expect(PathSchema.safeParse("https://evil.com/x").success).toBe(false);
    expect(PathSchema.safeParse("http://evil.com").success).toBe(false);
  });

  it("rejects protocol-relative URLs", () => {
    expect(PathSchema.safeParse("//evil.com/x").success).toBe(false);
  });

  it("rejects path traversal", () => {
    expect(PathSchema.safeParse("/worker/../admin").success).toBe(false);
  });

  it("rejects unsafe characters", () => {
    expect(PathSchema.safeParse("/worker<script>").success).toBe(false);
    expect(PathSchema.safeParse("/worker\n").success).toBe(false);
  });

  it("rejects empty and non-slash-starting", () => {
    expect(PathSchema.safeParse("").success).toBe(false);
    expect(PathSchema.safeParse("worker").success).toBe(false);
  });
});
