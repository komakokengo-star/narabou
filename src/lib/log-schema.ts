// Stripe webhook 受信処理用の構造化ログスキーマ & バリデータ。
// scripts/log-schema.mjs と同じ設計思想: event ごとに必須/任意フィールドと型を宣言し、
// logJson 時に検証する。違反時は Cloudflare Worker 上で process.exit できないため、
// log.schema_violation を出力しつつ処理は続行する。

export type LogLevel = "info" | "warn" | "error" | "debug";

type FieldType = "string" | "number" | "boolean" | "object" | "array" | "null";

export interface LogSchema {
  required: Record<string, FieldType>;
  optional?: Record<string, FieldType>;
}

export const WEBHOOK_LOG_SCHEMAS: Record<string, LogSchema> = {
  "webhook.received": {
    required: { runId: "string", hasSignature: "boolean", bodyBytes: "number" },
    optional: { signatureVerified: "boolean" },
  },
  "webhook.rejected": {
    required: { runId: "string", reason: "string", httpStatus: "number" },
  },
  "webhook.duplicate": {
    required: { runId: "string", eventId: "string", type: "string" },
  },
  "webhook.processed": {
    required: {
      runId: "string", eventId: "string", type: "string", durationMs: "number",
    },
    optional: { affectedRows: "number" },
  },
  "webhook.handler_error": {
    required: { runId: "string", eventId: "string", type: "string", message: "string" },
  },
  "webhook.db_error": {
    required: { runId: "string", stage: "string", message: "string" },
    optional: { code: "string" },
  },
};

// Stripe Connect (受取口座) 用イベント。個人情報 (氏名/口座番号/DOB 等) は絶対に載せない。
// 記録して良いのは actor(userId)・action種別・Stripe accountId・結果ブール・失敗理由のカテゴリのみ。
export const CONNECT_LOG_SCHEMAS: Record<string, LogSchema> = {
  "connect.request": {
    required: { runId: "string", userId: "string", action: "string" },
  },
  "connect.forbidden": {
    required: { runId: "string", userId: "string", action: "string", reason: "string" },
  },
  "connect.invalid_input": {
    required: { runId: "string", userId: "string", action: "string", reason: "string" },
  },
  "connect.account_created": {
    required: { runId: "string", userId: "string", accountId: "string", durationMs: "number" },
  },
  "connect.account_reused": {
    required: { runId: "string", userId: "string", accountId: "string" },
  },
  "connect.account_session_created": {
    required: { runId: "string", userId: "string", accountId: "string", durationMs: "number" },
  },
  "connect.account_branding_updated": {
    required: { runId: "string", userId: "string", accountId: "string" },
  },
  "connect.account_replaced": {
    required: { runId: "string", userId: "string", oldAccountId: "string", accountId: "string" },
  },
  "connect.account_update_skipped": {
    required: { runId: "string", userId: "string", accountId: "string", message: "string" },
  },
  "connect.link_created": {
    required: { runId: "string", userId: "string", accountId: "string", durationMs: "number" },
  },
  "connect.status_refreshed": {
    required: {
      runId: "string", userId: "string", accountId: "string",
      ready: "boolean", durationMs: "number",
    },
  },
  "connect.stripe_error": {
    required: { runId: "string", userId: "string", action: "string", message: "string" },
    optional: { code: "string", stripeType: "string" },
  },
  "connect.db_error": {
    required: { runId: "string", userId: "string", stage: "string", message: "string" },
    optional: { code: "string" },
  },
};

export const ALL_LOG_SCHEMAS: Record<string, LogSchema> = {
  ...WEBHOOK_LOG_SCHEMAS,
  ...CONNECT_LOG_SCHEMAS,
};

const LOG_LEVELS: LogLevel[] = ["info", "warn", "error", "debug"];

export function typeOf(v: unknown): FieldType {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean" || t === "object") return t;
  return "null";
}

export function validateLog(
  obj: unknown,
  schemas: Record<string, LogSchema> = ALL_LOG_SCHEMAS,
): string[] {
  const errs: string[] = [];
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return ["record must be a plain object"];
  }
  const rec = obj as Record<string, unknown>;
  for (const k of ["ts", "level", "event"]) {
    if (typeof rec[k] !== "string") errs.push(`missing/invalid ${k}`);
  }
  if (typeof rec.level === "string" && !LOG_LEVELS.includes(rec.level as LogLevel)) {
    errs.push(`invalid level: ${rec.level}`);
  }
  if (typeof rec.ts === "string" && Number.isNaN(Date.parse(rec.ts))) {
    errs.push(`invalid ts: ${rec.ts}`);
  }
  const eventName = rec.event as string | undefined;
  const schema = eventName ? schemas[eventName] : undefined;
  if (eventName && !schema) {
    errs.push(`unknown event: ${eventName}`);
  } else if (schema) {
    for (const [k, t] of Object.entries(schema.required)) {
      if (!(k in rec)) { errs.push(`missing required ${k}`); continue; }
      const actual = typeOf(rec[k]);
      if (actual !== t) errs.push(`${k}: expected ${t}, got ${actual}`);
    }
    for (const [k, t] of Object.entries(schema.optional ?? {})) {
      if (k in rec && rec[k] !== null && typeOf(rec[k]) !== t) {
        errs.push(`${k}: expected ${t}, got ${typeOf(rec[k])}`);
      }
    }
  }
  return errs;
}

export function buildRecord(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  return { ts: new Date().toISOString(), level, event, ...fields };
}

/**
 * 構造化ログを1行のJSONで出力する。スキーマ違反時は log.schema_violation を
 * error レベルで書き出すが、Worker 上のリクエスト処理は継続する（テストスクリプトと違い exit しない）。
 * 戻り値は「スキーマ検証を通過したか」を返す。単体テスト向け。
 */
export function logJson(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
  sink: { log: (s: string) => void; error: (s: string) => void } = console,
): boolean {
  const record = buildRecord(level, event, fields);
  const errs = validateLog(record);
  if (errs.length) {
    const violation = {
      ts: new Date().toISOString(),
      level: "error" as const,
      event: "log.schema_violation",
      violations: errs,
      record,
    };
    sink.error(JSON.stringify(violation));
    return false;
  }
  const line = JSON.stringify(record);
  (level === "error" ? sink.error : sink.log)(line);
  return true;
}
