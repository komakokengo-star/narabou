import { describe, it, expect } from "vitest";
import {
  LOG_SCHEMAS,
  validateLog,
  buildRecord,
  typeOf,
} from "../log-schema.mjs";

const base = (event, fields = {}) => ({
  ts: "2026-07-03T00:00:00.000Z",
  level: "info",
  event,
  ...fields,
});

const validAttempt = () =>
  base("verify.attempt", {
    runId: "run_1",
    attempt: 1,
    maxAttempts: 7,
    durationMs: 12,
    ok: true,
  });

const validBackoff = () =>
  base("verify.backoff", {
    runId: "run_1",
    attempt: 1,
    nextAttempt: 2,
    waitMs: 500,
    capMs: 20000,
  });

const validPass = () =>
  base("verify.pass", { runId: "run_1", attempts: 3 });

const validFail = () =>
  base("verify.fail", { runId: "run_1", attempts: 7 });

describe("typeOf", () => {
  it("distinguishes null / array / object / primitives", () => {
    expect(typeOf(null)).toBe("null");
    expect(typeOf([])).toBe("array");
    expect(typeOf({})).toBe("object");
    expect(typeOf("x")).toBe("string");
    expect(typeOf(1)).toBe("number");
    expect(typeOf(true)).toBe("boolean");
  });
});

describe("validateLog - common envelope", () => {
  it("returns errors for non-object input", () => {
    expect(validateLog(null)).toContain("record must be a plain object");
    expect(validateLog("x")).toContain("record must be a plain object");
    expect(validateLog([])).toContain("record must be a plain object");
  });

  it("requires ts/level/event as strings", () => {
    const errs = validateLog({});
    expect(errs).toEqual(expect.arrayContaining([
      "missing/invalid ts",
      "missing/invalid level",
      "missing/invalid event",
    ]));
  });

  it("rejects unknown log level", () => {
    const rec = validAttempt();
    rec.level = "trace";
    expect(validateLog(rec)).toContain("invalid level: trace");
  });

  it("rejects invalid ts", () => {
    const rec = validAttempt();
    rec.ts = "not-a-date";
    expect(validateLog(rec)).toContain("invalid ts: not-a-date");
  });

  it("rejects unknown event", () => {
    const rec = base("verify.mystery");
    expect(validateLog(rec)).toContain("unknown event: verify.mystery");
  });
});

describe("validateLog - verify.attempt", () => {
  it("passes with all required fields", () => {
    expect(validateLog(validAttempt())).toEqual([]);
  });

  it("passes with optional fields of correct type", () => {
    const rec = validAttempt();
    rec.httpStatus = 200;
    rec.body = "ok";
    rec.passed = true;
    rec.remaining = { stripe_events: 0, payments: 0 };
    expect(validateLog(rec)).toEqual([]);
  });

  it("flags each missing required field", () => {
    const rec = validAttempt();
    delete rec.runId;
    delete rec.attempt;
    const errs = validateLog(rec);
    expect(errs).toEqual(expect.arrayContaining([
      "missing required runId",
      "missing required attempt",
    ]));
  });

  it("flags wrong required type", () => {
    const rec = validAttempt();
    rec.attempt = "1";
    rec.ok = "yes";
    const errs = validateLog(rec);
    expect(errs).toEqual(expect.arrayContaining([
      "attempt: expected number, got string",
      "ok: expected boolean, got string",
    ]));
  });

  it("flags wrong optional type but allows null", () => {
    const rec = validAttempt();
    rec.httpStatus = "200";
    rec.remaining = null; // null は許可
    const errs = validateLog(rec);
    expect(errs).toContain("httpStatus: expected number, got string");
    expect(errs).not.toContain(expect.stringContaining("remaining"));
  });

  it("rejects array where object is expected (optional.remaining)", () => {
    const rec = validAttempt();
    rec.remaining = [];
    expect(validateLog(rec)).toContain("remaining: expected object, got array");
  });
});

describe("validateLog - verify.backoff", () => {
  it("passes with all required fields", () => {
    expect(validateLog(validBackoff())).toEqual([]);
  });

  it("flags missing waitMs / capMs", () => {
    const rec = validBackoff();
    delete rec.waitMs;
    delete rec.capMs;
    const errs = validateLog(rec);
    expect(errs).toEqual(expect.arrayContaining([
      "missing required waitMs",
      "missing required capMs",
    ]));
  });
});

describe("validateLog - verify.pass / verify.fail", () => {
  it("verify.pass passes with runId + attempts", () => {
    expect(validateLog(validPass())).toEqual([]);
  });

  it("verify.fail passes without remaining", () => {
    expect(validateLog(validFail())).toEqual([]);
  });

  it("verify.fail accepts remaining object", () => {
    const rec = validFail();
    rec.remaining = { stripe_events: 1, payments: 0 };
    expect(validateLog(rec)).toEqual([]);
  });

  it("verify.fail rejects non-object remaining", () => {
    const rec = validFail();
    rec.remaining = "nope";
    expect(validateLog(rec)).toContain("remaining: expected object, got string");
  });
});

describe("buildRecord", () => {
  it("produces an ISO ts and merges fields", () => {
    const r = buildRecord("info", "verify.pass", { runId: "r", attempts: 1 });
    expect(r.level).toBe("info");
    expect(r.event).toBe("verify.pass");
    expect(r.runId).toBe("r");
    expect(Number.isNaN(Date.parse(r.ts))).toBe(false);
    expect(validateLog(r)).toEqual([]);
  });
});

describe("LOG_SCHEMAS shape", () => {
  it("declares the four expected events", () => {
    expect(Object.keys(LOG_SCHEMAS).sort()).toEqual([
      "verify.attempt",
      "verify.backoff",
      "verify.fail",
      "verify.pass",
    ]);
  });
});
