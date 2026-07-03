#!/usr/bin/env node
/**
 * Stripe Webhook E2Eテスト用スクリプト
 *
 * 使い方:
 *   STRIPE_WEBHOOK_SECRET=whsec_xxx node scripts/test-stripe-webhook.mjs \
 *     --url https://<host>/api/public/webhooks/stripe \
 *     --case valid|bad-signature|no-signature|duplicate|unknown-type|refunded|failed|account-updated
 *
 * 追加オプション:
 *   --pi pi_xxx         payment_intent.id を指定
 *   --account acct_xxx  Connect accountId を指定
 *   --event evt_xxx     event.id を明示指定（冪等テスト用）
 */
import crypto from "node:crypto";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);

const url = args.url;
const secret = process.env.STRIPE_WEBHOOK_SECRET;
const caseName = args.case ?? "valid";
if (!url) { console.error("--url required"); process.exit(1); }
if (!secret) { console.error("STRIPE_WEBHOOK_SECRET env required"); process.exit(1); }

const eventId = args.event ?? `evt_test_${crypto.randomBytes(6).toString("hex")}`;
const pi = args.pi ?? `pi_test_${crypto.randomBytes(6).toString("hex")}`;
const acct = args.account ?? `acct_test_${crypto.randomBytes(6).toString("hex")}`;

function buildEvent(kind) {
  const base = { id: eventId, object: "event", api_version: "2024-06-20", created: Math.floor(Date.now() / 1000) };
  switch (kind) {
    case "valid":
    case "duplicate":
      return { ...base, type: "payment_intent.succeeded", data: { object: { id: pi, object: "payment_intent", status: "succeeded" } } };
    case "failed":
      return { ...base, type: "payment_intent.payment_failed", data: { object: { id: pi, object: "payment_intent", status: "requires_payment_method" } } };
    case "refunded":
      return { ...base, type: "charge.refunded", data: { object: { id: `ch_${crypto.randomBytes(6).toString("hex")}`, object: "charge", payment_intent: pi, amount_refunded: 1000 } } };
    case "account-updated":
      return { ...base, type: "account.updated", data: { object: { id: acct, object: "account", charges_enabled: true, payouts_enabled: true } } };
    case "unknown-type":
      return { ...base, type: "customer.created", data: { object: { id: `cus_${crypto.randomBytes(6).toString("hex")}`, object: "customer" } } };
    default:
      return { ...base, type: "payment_intent.succeeded", data: { object: { id: pi } } };
  }
}

function signPayload(payload, secret, { tamperSig = false, tamperBody = false } = {}) {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = tamperBody ? payload.replace(/"/, "'") : payload;
  const signed = `${timestamp}.${body}`;
  let v1 = crypto.createHmac("sha256", secret).update(signed, "utf8").digest("hex");
  if (tamperSig) v1 = v1.replace(/^./, v1[0] === "0" ? "1" : "0");
  return { header: `t=${timestamp},v1=${v1}`, body };
}

async function send(kind) {
  const eventBody = JSON.stringify(buildEvent(kind));
  const tamperSig = kind === "bad-signature";
  const tamperBody = kind === "tampered-body";
  const { header, body } = signPayload(eventBody, secret, { tamperSig, tamperBody });
  const headers = { "content-type": "application/json" };
  if (kind !== "no-signature") headers["stripe-signature"] = header;
  const res = await fetch(url, { method: "POST", headers, body });
  const text = await res.text();
  console.log(`[${kind}] ${res.status} ${text}  event=${eventId}`);
  return { status: res.status, text };
}

// CI用: --expect <status> を渡すと期待コードと不一致の場合exit 1
const expect = args.expect ? Number(args.expect) : null;

async function cleanup() {
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac("sha256", secret).update(ts).digest("hex");
  const cleanupUrl = url.replace(/\/webhooks\/stripe$/, "/hooks/test-cleanup");
  const res = await fetch(cleanupUrl, {
    method: "POST",
    headers: { "x-test-cleanup": `t=${ts},v1=${sig}` },
  });
  const text = await res.text();
  console.log(`[cleanup] ${res.status} ${text}`);
  if (res.status !== 200) process.exit(1);
}

async function fetchRemaining(verifyUrl) {
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac("sha256", secret).update(ts).digest("hex");
  const res = await fetch(verifyUrl, {
    method: "GET",
    headers: { "x-test-cleanup": `t=${ts},v1=${sig}` },
  });
  const text = await res.text();
  if (res.status !== 200) return { ok: false, status: res.status, text };
  try { return { ok: true, json: JSON.parse(text), text }; }
  catch { return { ok: false, status: res.status, text }; }
}

async function verify() {
  const verifyUrl = url.replace(/\/webhooks\/stripe$/, "/hooks/test-cleanup");
  // 指数バックオフでリトライ: 0.5s, 1s, 2s, 4s, 8s, 16s (合計 ~31s, 最大7試行)
  const maxAttempts = Number(process.env.VERIFY_MAX_ATTEMPTS ?? 7);
  const baseMs = Number(process.env.VERIFY_BASE_MS ?? 500);
  let last = null;
  for (let i = 0; i < maxAttempts; i++) {
    const r = await fetchRemaining(verifyUrl);
    last = r;
    if (!r.ok) {
      console.error(`[verify attempt ${i + 1}/${maxAttempts}] HTTP ${r.status} ${r.text}`);
    } else {
      const ev = r.json?.remaining?.stripe_events ?? -1;
      const py = r.json?.remaining?.payments ?? -1;
      console.log(`[verify attempt ${i + 1}/${maxAttempts}] stripe_events=${ev} payments=${py}`);
      if (ev === 0 && py === 0) {
        console.log(`[verify] ${r.text}`);
        return;
      }
    }
    if (i < maxAttempts - 1) {
      const wait = baseMs * 2 ** i;
      await new Promise((res) => setTimeout(res, wait));
    }
  }

  console.error(`FAIL: remaining not zero after ${maxAttempts} attempts`);
  // 詳細サンプルを取得してログ & アーティファクトへ
  const ts2 = String(Math.floor(Date.now() / 1000));
  const sig2 = crypto.createHmac("sha256", secret).update(ts2).digest("hex");
  const detailUrl = `${verifyUrl}?samples=1&limit=200`;
  const detailRes = await fetch(detailUrl, {
    method: "GET",
    headers: { "x-test-cleanup": `t=${ts2},v1=${sig2}` },
  });
  const detailText = await detailRes.text();
  console.error("---- leaked test records ----");
  console.error(detailText);
  console.error("-----------------------------");
  const outDir = process.env.ARTIFACT_DIR ?? "./artifacts";
  try {
    const fs = await import("node:fs/promises");
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(`${outDir}/leaked-test-records.json`, detailText);
    await fs.writeFile(
      `${outDir}/verify-summary.json`,
      JSON.stringify(
        { remaining: last?.json?.remaining ?? null, attempts: maxAttempts, at: new Date().toISOString() },
        null,
        2,
      ),
    );
    console.error(`Wrote artifacts to ${outDir}/`);
  } catch (e) {
    console.error("failed to write artifact:", e);
  }
  process.exit(1);
}

if (caseName === "cleanup") {
  await cleanup();
  console.log("PASS");
  process.exit(0);
}

if (caseName === "verify") {
  await verify();
  console.log("PASS");
  process.exit(0);
}


let results = [];
if (caseName === "duplicate") {
  results.push(await send("valid"));
  results.push(await send("valid"));
  // 1回目は200 ok、2回目は200 duplicate
  if (results[0].status !== 200 || results[1].status !== 200 || !results[1].text.includes("duplicate")) {
    console.error("FAIL: duplicate event should return 200 duplicate on second call");
    process.exit(1);
  }
} else {
  const r = await send(caseName);
  results.push(r);
  if (expect !== null && r.status !== expect) {
    console.error(`FAIL: expected ${expect}, got ${r.status}`);
    process.exit(1);
  }
}
console.log("PASS");
