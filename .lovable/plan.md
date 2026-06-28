## 概要

福岡行列代行サービスのフルMVPを構築します。依頼者・代行者・管理者の3ロール、Stripe Connect（テストモード）による分配、位置情報・写真アップロード、日英切替対応。

## 構築ステップ

### 1. 基盤セットアップ
- Lovable Cloud（DB / Auth / Storage）を有効化
- メール+パスワード認証（メール確認は無効化、ベータ用）
- i18n（日本語/英語）: `react-i18next` を導入
- デザインシステム: 落ち着いた和モダン（朱赤アクセント＋オフホワイト）、Noto Sans JP

### 2. データベース（マイグレーション）
- `profiles`（id=auth.users, name, role未使用, rating, verified, stripe_account_id）
- `user_roles`（user_id, role: customer/worker/admin）+ `has_role()` SECURITY DEFINER
- `requests`（customer_id, store_name, store_address, desired_time, status, base_fee, extra_fee, peak_fee, total_fee, created_at）
- `matches`（request_id, worker_id, arrival_time, start_time, end_time）
- `checkins`（match_id, timestamp, lat, lng, wait_time, photo_url）
- `payments`（request_id, amount, platform_fee, worker_payout, status, stripe_payment_intent_id, stripe_transfer_id, refund_amount）
- `verifications`（worker_id, id_photo_url, status）
- RLS: 依頼者は自分の依頼のみ、代行者はopen依頼閲覧+自分のmatch、adminは全件
- Storage バケット: `checkin-photos`（公開）、`verifications`（非公開）
- GRANT文を各テーブルに付与

### 3. Stripe Connect（テストモード）
- ユーザーから `STRIPE_SECRET_KEY`（テスト）取得
- サーバー関数:
  - `createPaymentIntent`: application_fee_amount=20%, transfer_data.destination=worker stripe_account_id
  - `createConnectAccount` + `createAccountLink`（代行者のオンボーディング）
  - `refundPayment`（キャンセル時、ポリシーに応じた部分返金）
  - `chargeExtension`（延長分の追加PaymentIntent）
  - `calculateFee`（料金計算式の単一source of truth）
- Webhook（`/api/public/webhooks/stripe`）: 署名検証 → payments更新

### 4. 画面実装

**共通**: ロール別ダッシュボードへのルーティング、言語切替ボタン、ヘッダー

**依頼者** (`/customer/*`)
- ホーム（店名検索・依頼作成CTA）
- 依頼作成（店名、住所、希望時間、ピーク有無）→ 料金プレビュー
- 依頼一覧／詳細（代行者の位置をマップ表示、誤差50-100m擬似ぼかし、待ち時間、延長承認、キャンセル）
- 支払い（Stripe Elements）
- マイページ（履歴・返金状況）

**代行者** (`/worker/*`)
- Stripeオンボーディング画面
- 公開依頼一覧 / 詳細＋受注
- 現地到着報告
- 定点報告（Geolocation + 写真アップロード + 待ち時間入力）
- 完了報告 → 報酬確定
- 報酬ダッシュボード
- 本人確認画像アップロード

**管理者** (`/admin/*`)
- 依頼一覧（ステータス別フィルタ）
- 代行者一覧（評価・本人確認承認）
- 支払い管理（手数料20%集計）
- キャンセル管理（強制キャンセル＋返金）
- ピーク料金フラグ設定
- トラブル対応（メモ）

### 5. ビジネスロジック
- 料金計算: `total = 800 + ceil(wait_min/10)*200 + (peak?300:0) + extra`
- キャンセル返金ロジック（到着前=全額/到着後=基本料金引き/待機後=経過分引き）
- 評価制度（完了後★1-5）、平均評価<3で受注ボタン非活性

### 6. シード・動作確認
- ユーザー自身のadmin付与SQLスニペット提供
- README に手順記載

## 技術詳細

- TanStack Start + TanStack Query
- 認証: Lovable Cloud / Supabase（メール確認OFF）
- 決済: Stripe Connect Standard、テストモード、`STRIPE_SECRET_KEY` をsecretとして保存、publishable keyはコード内
- マップ: 軽量に Leaflet + OpenStreetMap（APIキー不要）
- i18n: react-i18next、JSON辞書を `src/i18n/{ja,en}.json`
- 位置情報ぼかし: 50-100mランダムオフセットを生成して表示
- 全フォーム: Zod バリデーション

## 注意事項

- Stripe Connectのオンボーディング完了は手動操作が必要（テストアカウント作成）
- ベータ運用想定のためメール確認OFF
- 管理者ロール付与は `user_roles` テーブルへの手動INSERTで対応（手順は完成後に案内）

承認いただければ実装に入ります。長丁場のため複数ターンに分けて進めます。