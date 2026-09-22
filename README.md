# Fukuoka Queue Buddy

【アプリ名】

福岡行列代行サービス（依頼者・代行者・管理者の3ロール）

【目的】

福岡市（博多・天神）の人気店に並ぶ代行サービスを提供するアプリを作成する。

依頼者は行列代行を依頼し、代行者は受注して現地で待機し、定点報告を行う。

依頼者はアプリ上で支払い・追加課金・キャンセル返金ができる。

管理者は手数料収入（20%）を得て、依頼・代行者・決済を統合管理する。

ベータ版として私自身が利用し、公開前に動作確認できるようにする。

-----------------------------------------

【料金体系（確定版）】

- 基本料金：800円

- 時間課金：10分ごとに200円

- ピーク料金：+300円（混雑時のみ）

- 追加課金：延長承認時に10分200円を加算

- 手数料：依頼総額の20%（運営者の収入）

- 代行者報酬：依頼総額の80%

【料金計算式】

依頼総額 = 基本料金

           + (待機時間[分] ÷ 10) × 200

           + ピーク料金（該当時のみ +300）

           + 追加課金（延長承認時）

運営者収入 = 依頼総額 × 0.20

代行者報酬 = 依頼総額 × 0.80

-----------------------------------------

【キャンセルポリシー（完全版）】

- 代行者が現地到着前：無料

- 現地到着後：基本料金800円のみ請求

- 待機開始後：経過時間分の時間課金を請求

- 延長承認後のキャンセル：延長分も請求

- 管理者は強制キャンセル可能（返金ロジック自動処理）

-----------------------------------------

【代行者報酬モデル】

- 報酬は依頼総額の80%

- 報酬は「完了報告」時に確定

- Stripe Connect を利用した即時振込（テストモードで動作）

- 評価制度（★1〜5）

- 低評価の代行者は受注制限

- 本人確認（画像アップロード）

- 位置情報は誤差50〜100mで表示（安全性確保）

-----------------------------------------

【キャッシュフロー設計】

依頼者 → Stripe決済 → 運営者（20%）＋代行者（80%）

- Stripe Connect（Standard or Express）を利用

- テストモードで動作確認できるようにする

- キャンセル時は自動返金（Stripe Refund API）

- 延長課金は追加請求（Stripe PaymentIntent）

-----------------------------------------

【外部連携（必須）】

- Stripe（決済・返金・追加課金・代行者への振込）

- 位置情報（ブラウザの Geolocation API）

- 画像アップロード（代行者の本人確認・定点報告）

-----------------------------------------

【画面仕様（ワイヤーフレームレベル）】

【依頼者側】

1. ホーム画面

   - 店名検索

   - 依頼作成ボタン

2. 依頼作成画面

   - 店名

   - 並んでほしい時間帯

   - ピーク料金の有無

3. 依頼詳細画面

   - 代行者の位置（誤差50〜100m）

   - 待ち時間

   - 延長承認ボタン

   - キャンセルボタン

4. 支払い画面（Stripe）

5. マイページ（履歴・返金状況）

【代行者側】

1. 依頼一覧

2. 依頼詳細（受注ボタン）

3. 現地到着報告

4. 定点報告（位置情報＋待ち時間＋写真）

5. 完了報告

6. 報酬画面（Stripe Connect）

【管理者側】

1. 依頼一覧（ステータス別）

2. 代行者一覧（評価・本人確認）

3. 支払い管理（手数料20%）

4. キャンセル管理（返金処理）

5. ピーク料金設定

6. トラブル対応画面

-----------------------------------------

【データベース（Supabase）】

users

- id

- name

- role（customer / worker / admin）

- rating

- verified（本人確認済）

requests

- id

- customer_id

- store_name

- desired_time

- status（open / matched / in_progress / completed / canceled）

- base_fee

- extra_fee

- total_fee

- peak_fee

matches

- id

- request_id

- worker_id

- start_time

- end_time

checkins

- id

- match_id

- timestamp

- location_lat

- location_lng

- wait_time

- photo_url

payments

- id

- request_id

- amount

- status（pending / paid / refunded）

- stripe_payment_intent_id

-----------------------------------------

【MVP要件】

- 依頼者・代行者・管理者の3ロールでログイン可能

- 料金体系と計算式を完全実装

- Stripe決済（テストモード）を実装

- 位置情報・写真アップロードを実装

- キャンセルポリシーを自動処理

- 手数料20%を管理者に計上

- ベータ版として私自身が利用できるようにする

以上の仕様に基づき、アプリを生成してください。

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://narabou.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/bc84fda8-23a4-4dfd-8a53-fea4e73274e7).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
