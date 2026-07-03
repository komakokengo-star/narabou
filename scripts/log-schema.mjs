// 構造化ログのスキーマ定義とバリデータ。
// test-stripe-webhook.mjs と単体テストの双方から参照する。

export const LOG_SCHEMAS = {
  "verify.attempt": {
    required: {
      runId: "string", attempt: "number", maxAttempts: "number",
      durationMs: "number", ok: "boolean",
    },
    optional: {
      httpStatus: "number", body: "string", passed: "boolean",
      remaining: "object",
    },
  },
  "verify.backoff": {
    required: {
      runId: "string", attempt: "number", nextAttempt: "number",
      waitMs: "number", capMs: "number",
    },
  },
  "verify.pass": {
    required: { runId: "string", attempts: "number" },
  },
  "verify.fail": {
    required: { runId: "string", attempts: "number" },
    optional: { remaining: "object" },
  },
};

export const LOG_LEVELS = ["info", "warn", "error", "debug"];

export function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

export function validateLog(obj, schemas = LOG_SCHEMAS) {
  const errs = [];
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return ["record must be a plain object"];
  }
  for (const k of ["ts", "level", "event"]) {
    if (typeof obj[k] !== "string") errs.push(`missing/invalid ${k}`);
  }
  if (obj.level && !LOG_LEVELS.includes(obj.level)) {
    errs.push(`invalid level: ${obj.level}`);
  }
  if (obj.ts && Number.isNaN(Date.parse(obj.ts))) {
    errs.push(`invalid ts: ${obj.ts}`);
  }
  const schema = schemas[obj.event];
  if (obj.event && !schema) {
    errs.push(`unknown event: ${obj.event}`);
  } else if (schema) {
    for (const [k, t] of Object.entries(schema.required)) {
      if (!(k in obj)) { errs.push(`missing required ${k}`); continue; }
      const actual = typeOf(obj[k]);
      if (actual !== t) errs.push(`${k}: expected ${t}, got ${actual}`);
    }
    for (const [k, t] of Object.entries(schema.optional ?? {})) {
      if (k in obj && obj[k] !== null && typeOf(obj[k]) !== t) {
        errs.push(`${k}: expected ${t}, got ${typeOf(obj[k])}`);
      }
    }
  }
  return errs;
}

export function buildRecord(level, event, fields) {
  return { ts: new Date().toISOString(), level, event, ...fields };
}
