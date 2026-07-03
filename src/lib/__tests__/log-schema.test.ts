import { describe, it, expect, vi } from "vitest";
import {
  WEBHOOK_LOG_SCHEMAS,
  validateLog,
  buildRecord,
  logJson,
  typeOf,
} from "@/lib/log-schema";

const base = (event: string, fields: Record<string, unknown> = {}): Record<string, unknown> => ({
  ts: "2026-07-03T00:00:00.000Z",
  level: "info",
  event,
  ...fields,
});

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

describe("WEBHOOK_LOG_SCHEMAS declares expected events", () => {
  it("has every webhook event we log from stripe.ts", () => {
    expect(Object.keys(WEBHOOK_LOG_SCHEMAS).sort()).toEqual([
      "webhook.db_error",
      "webhook.duplicate",
      "webhook.handler_error",
      "webhook.processed",
      "webhook.received",
      "webhook.rejected",
    ]);
  });
});

describe("validateLog - envelope", () => {
  it("rejects non-object", () => {
    expect(validateLog(null)).toContain("record must be a plain object");
    expect(validateLog([])).toContain("record must be a plain object");
    expect(validateLog("x")).toContain("record must be a plain object");
  });

  it("requires ts/level/event", () => {
    expect(validateLog({})).toEqual(expect.arrayContaining([
      "missing/invalid ts", "missing/invalid level", "missing/invalid event",
    ]));
  });

  it("rejects invalid level & ts", () => {
    const rec = base("webhook.received", { runId: "r", hasSignature: true, bodyBytes: 1 });
    rec.level = "trace";
    rec.ts = "not-a-date";
    const errs = validateLog(rec);
    expect(errs).toContain("invalid level: trace");
    expect(errs).toContain("invalid ts: not-a-date");
  });

  it("rejects unknown event", () => {
    expect(validateLog(base("webhook.mystery"))).toContain("unknown event: webhook.mystery");
  });
});

describe("validateLog - webhook.received", () => {
  const valid = () => base("webhook.received", { runId: "r", hasSignature: true, bodyBytes: 42 });

  it("passes minimally", () => expect(validateLog(valid())).toEqual([]));

  it("accepts optional signatureVerified boolean", () => {
    const rec = valid(); rec.signatureVerified = false;
    expect(validateLog(rec)).toEqual([]);
  });

  it("flags missing required", () => {
    const rec = valid(); delete (rec as Record<string, unknown>).bodyBytes;
    expect(validateLog(rec)).toContain("missing required bodyBytes");
  });

  it("flags wrong required type", () => {
    const rec = valid(); rec.hasSignature = "yes"; rec.bodyBytes = "42";
    const errs = validateLog(rec);
    expect(errs).toContain("hasSignature: expected boolean, got string");
    expect(errs).toContain("bodyBytes: expected number, got string");
  });

  it("flags wrong optional type but allows null", () => {
    const rec = valid(); rec.signatureVerified = "true";
    expect(validateLog(rec)).toContain("signatureVerified: expected boolean, got string");
    const rec2 = valid(); rec2.signatureVerified = null;
    expect(validateLog(rec2)).toEqual([]);
  });
});

describe("validateLog - webhook.rejected / duplicate / processed", () => {
  it("webhook.rejected requires reason + httpStatus", () => {
    expect(validateLog(base("webhook.rejected", { runId: "r", reason: "x", httpStatus: 400 }))).toEqual([]);
    const missing = validateLog(base("webhook.rejected", { runId: "r" }));
    expect(missing).toEqual(expect.arrayContaining([
      "missing required reason", "missing required httpStatus",
    ]));
  });

  it("webhook.duplicate requires eventId + type strings", () => {
    expect(validateLog(base("webhook.duplicate", { runId: "r", eventId: "evt_1", type: "t" }))).toEqual([]);
    const bad = validateLog(base("webhook.duplicate", { runId: "r", eventId: 1, type: "t" }));
    expect(bad).toContain("eventId: expected string, got number");
  });

  it("webhook.processed accepts optional affectedRows", () => {
    const rec = base("webhook.processed", {
      runId: "r", eventId: "evt", type: "t", durationMs: 10, affectedRows: 2,
    });
    expect(validateLog(rec)).toEqual([]);
  });

  it("webhook.processed rejects wrong affectedRows type", () => {
    const rec = base("webhook.processed", {
      runId: "r", eventId: "evt", type: "t", durationMs: 10, affectedRows: "2",
    });
    expect(validateLog(rec)).toContain("affectedRows: expected number, got string");
  });
});

describe("validateLog - webhook.handler_error / db_error", () => {
  it("handler_error passes", () => {
    expect(validateLog(base("webhook.handler_error", {
      runId: "r", eventId: "evt", type: "t", message: "boom",
    }))).toEqual([]);
  });

  it("db_error accepts optional code", () => {
    expect(validateLog(base("webhook.db_error", {
      runId: "r", stage: "insert", message: "boom", code: "23505",
    }))).toEqual([]);
  });
});

describe("buildRecord", () => {
  it("emits ISO ts and merges fields", () => {
    const r = buildRecord("info", "webhook.received", {
      runId: "r", hasSignature: true, bodyBytes: 1,
    });
    expect(Number.isNaN(Date.parse(r.ts as string))).toBe(false);
    expect(validateLog(r)).toEqual([]);
  });
});

describe("logJson", () => {
  const makeSink = () => ({
    log: vi.fn<(s: string) => void>(),
    error: vi.fn<(s: string) => void>(),
  });

  it("returns true and writes to log sink on valid info", () => {
    const sink = makeSink();
    const ok = logJson("info", "webhook.received",
      { runId: "r", hasSignature: true, bodyBytes: 1 }, sink);
    expect(ok).toBe(true);
    expect(sink.log).toHaveBeenCalledTimes(1);
    expect(sink.error).not.toHaveBeenCalled();
    const parsed = JSON.parse(sink.log.mock.calls[0][0]);
    expect(parsed.event).toBe("webhook.received");
    expect(parsed.runId).toBe("r");
  });

  it("routes error level to error sink", () => {
    const sink = makeSink();
    logJson("error", "webhook.handler_error",
      { runId: "r", eventId: "e", type: "t", message: "x" }, sink);
    expect(sink.error).toHaveBeenCalledTimes(1);
    expect(sink.log).not.toHaveBeenCalled();
  });

  it("emits log.schema_violation and returns false on invalid record (does NOT throw)", () => {
    const sink = makeSink();
    const ok = logJson("info", "webhook.received",
      { runId: "r", hasSignature: "no", bodyBytes: 1 }, sink);
    expect(ok).toBe(false);
    expect(sink.error).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(sink.error.mock.calls[0][0]);
    expect(parsed.event).toBe("log.schema_violation");
    expect(parsed.violations).toContain("hasSignature: expected boolean, got string");
    expect(parsed.record.event).toBe("webhook.received");
  });

  it("emits log.schema_violation for unknown event", () => {
    const sink = makeSink();
    const ok = logJson("info", "webhook.unknown", { runId: "r" }, sink);
    expect(ok).toBe(false);
    const parsed = JSON.parse(sink.error.mock.calls[0][0]);
    expect(parsed.violations).toContain("unknown event: webhook.unknown");
  });
});
