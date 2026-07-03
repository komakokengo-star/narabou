# Stripe Webhook 署名検証 E2Eテスト手順

`POST /api/public/webhooks/stripe` の署名検証と冪等処理を、実環境（プレビュー/本番URL）に対して検証する手順です。

---

## 事前準備

1. Lovable Cloud側で `STRIPE_WEBHOOK_SECRET` が設定されていること（`whsec_...`）。
2. Stripeダッシュボード → 開発者 → Webhooks で以下のイベントを購読するエンドポイントを登録:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - `account.updated`
3. エンドポイントURL例:
   - プレビュー: `https://project--<PROJECT_ID>-dev.lovable.app/api/public/webhooks/stripe`
   - 本番: `https://project--<PROJECT_ID>.lovable.app/api/public/webhooks/stripe`

---

## テスト方法A: Stripe CLI（推奨）

```bash
# 1) ローカルからエンドポイントへ本物のイベントを送信
stripe login
stripe trigger payment_intent.succeeded \
  --api-key sk_test_xxx \
  --override payment_intent:metadata.request_id=<REQUEST_UUID>

# 2) 直近イベントを再送してリプレイ／冪等性を確認
stripe events resend <EVENT_ID>
```

期待挙動:
- 1回目: 200 `ok`、`payments.status='paid'` に更新、`stripe_events` に1行INSERT。
- 2回目（同じevent_id）: 200 `duplicate`、DBの2重書き込みなし。

---

## テスト方法B: 付属スクリプト（Stripe CLI不要）

`scripts/test-stripe-webhook.mjs` を用意しています。`STRIPE_WEBHOOK_SECRET` から
正しい `stripe-signature` ヘッダを生成してPOSTします。

```bash
# 実行例
STRIPE_WEBHOOK_SECRET=whsec_xxx \
  node scripts/test-stripe-webhook.mjs \
  --url https://project--<PROJECT_ID>-dev.lovable.app/api/public/webhooks/stripe \
  --case valid
```

`--case` に指定できる値: `valid` / `bad-signature` / `no-signature` / `duplicate` / `unknown-type`

---

## テストケース一覧

| # | ケース | リクエスト | 期待レスポンス | 期待DB状態 |
|---|-------|-----------|---------------|-----------|
| 1 | 正常系（succeeded） | 正しい署名 + `payment_intent.succeeded` | 200 `ok` | `payments.status='paid'`、`stripe_events` に1行 |
| 2 | 署名不正 | ヘッダを改ざん | 400 `invalid signature` | 変化なし |
| 3 | 署名ヘッダ欠落 | `stripe-signature` を送らない | 400 `missing stripe-signature` | 変化なし |
| 4 | ボディ改ざん | 正しい署名 + JSON中の1文字を書き換え | 400 `invalid signature` | 変化なし |
| 5 | 冪等（リプレイ） | 同じ `event.id` で2回POST | 1回目 200 `ok` / 2回目 200 `duplicate` | 更新は1回のみ、`stripe_events` は1行のみ |
| 6 | 失敗系（payment_failed） | 正しい署名 + `payment_intent.payment_failed` | 200 `ok` | `payments.status='failed'` |
| 7 | 返金（charge.refunded） | 正しい署名 + `charge.refunded` | 200 `ok` | `payments.status='refunded'`, `refund_amount` 更新 |
| 8 | Connect更新（account.updated） | `charges_enabled=true, payouts_enabled=true` | 200 `ok` | `profiles.stripe_account_ready=true` |
| 9 | 未対応イベント種別 | 正しい署名 + `customer.created` 等 | 200 `ok` | ハンドラなしでもエラーにならず `stripe_events` にのみ記録 |

---

## 確認クエリ（管理者ロールで実行）

```sql
-- 直近の処理済みイベント
SELECT event_id, type, processed_at
FROM public.stripe_events
ORDER BY processed_at DESC
LIMIT 20;

-- 対象paymentの状態
SELECT id, stripe_payment_intent_id, status, refund_amount, updated_at
FROM public.payments
WHERE stripe_payment_intent_id = 'pi_xxx';
```

---

## トラブルシュート

- **常に400 invalid signature**: 環境の `STRIPE_WEBHOOK_SECRET` が
  Stripeダッシュボードのエンドポイント別 `Signing secret` と一致しているか確認。
  テスト/本番モードで別値になる点に注意。
- **200なのにDBが変わらない**: `payments.stripe_payment_intent_id` に一致する行が
  存在しない可能性。先に `createPaymentIntent` で決済を作成しておく。
- **`duplicate` にならず二重更新される**: `stripe_events` テーブルが未作成の可能性。
  マイグレーションが適用されているか確認。
