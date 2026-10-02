# App Store 再提出用 回答文・画面録画台本（2026-10）

却下理由: Guideline 1.2（UGC安全対策）/ Guideline 5.1.1(v)（電話番号の必須収集）
対応: Web側（https://app.narabou.jp）を修正。ライブ配信型アプリのためアプリの再ビルド・再アップロードは不要。

---

## ① App Review への返信文（英語）

```
Thank you for your review. We have addressed both issues. NARABOU is a live-delivery app that renders our website (https://app.narabou.jp), so all fixes are already live — no new binary is required.

Guideline 1.2 — User Generated Content safety:
- Filtering: all user-submitted text (request notes, check-in notes, comments) is stored server-side and reviewed by our moderation team; reported content is reviewed within 24 hours.
- Report mechanism: every job/request detail screen now has a "通報する" (Report) button. Users choose a reason (harassment, inappropriate content, fraud, no-show, other) and can add details. Reports are instantly delivered to the admin console (管理コンソール → 通報管理) with a real-time admin notification.
- Block mechanism: every detail screen also has a "ブロックする" (Block) button. Blocking immediately removes the other party's requests/jobs from the user's lists. Blocking is silent (the other party is not notified) and can be undone.
- 24-hour action: admins can, from the report console, cancel the offending request (content removal) and suspend the reported account (profiles.suspended_at). Suspended users are signed out and cannot use the app. Our policy is to act on all reports within 24 hours.
- EULA/Terms: the Terms of Service (利用規約, https://app.narabou.jp/terms) must be explicitly accepted via checkbox before sign-up; it prohibits abusive and unlawful content.

Guideline 5.1.1(v) — Phone number:
- The phone number field on the sign-up form is now optional (labeled "電話番号（任意）" / "Phone number (optional)"). Registration completes without it.

A screen recording demonstrating the report flow, block flow, admin resolution, and optional phone field is attached/provided via the link in App Review Information.

Demo account: review@narabou.jp (credentials in App Review Information).
```

## ①' 日本語版（控え）

```
審査ありがとうございます。2点とも対応しました。NARABOUはサイト（https://app.narabou.jp）を表示するライブ配信型アプリのため、修正はすでに本番に反映済みで、新しいバイナリは不要です。

1.2（UGC安全対策）:
- フィルタリング: ユーザー投稿テキストはサーバーに保存され、運営が確認。通報されたコンテンツは24時間以内に審査。
- 通報: 依頼/案件の詳細画面に「通報する」ボタン。理由選択（迷惑行為/不適切な内容/詐欺/無断キャンセル/その他）＋詳細入力。管理コンソール「通報管理」へ即時通知。
- ブロック: 詳細画面に「ブロックする」ボタン。ブロックすると相手の依頼・案件が自分の一覧から即時に非表示。相手には通知されず、解除も可能。
- 24時間以内の対応: 管理者は通報画面から、違反依頼の取り消し（コンテンツ削除）とアカウント停止（suspended_at）が可能。停止されたユーザーはログアウトされ利用不可。
- EULA: 新規登録前に利用規約（https://app.narabou.jp/terms）への同意チェックが必須。規約は迷惑行為・違法コンテンツを禁止。

5.1.1(v)（電話番号）:
- 登録フォームの電話番号を任意項目に変更（「電話番号（任意）」表示）。未入力でも登録完了可能。

通報・ブロック・管理対応・電話番号任意化の画面録画を添付/リンクします。
デモアカウント: review@narabou.jp（App Review情報に記載）。
```

---

## ② 画面録画の台本（iPhone実機で撮影・2〜3分）

1. **規約提示（10秒）**: アプリを開く → 新規登録画面 → 利用規約リンクと同意チェックボックスを映す
2. **電話番号が任意（15秒）**: 登録画面で「電話番号（任意）」ラベルを映す → 電話番号を空のまま登録できることを示す（入力せず次へ進める画面まで）
3. **通報（30秒）**: レビュー用アカウントでログイン → 依頼詳細画面を開く → 「通報する」→ 理由選択＋詳細入力 → 送信 → 「24時間以内に確認・対応します」のトーストを映す
4. **ブロック（20秒）**: 同じ画面で「ブロックする」→ 確認ダイアログ → 実行 → 一覧から相手の案件が消えることを映す → 右上の人型アイコン →「ブロックしたユーザー」→「ブロック解除」で元に戻せることも映す
5. **管理側対応（30秒）**: 管理者アカウント（info@narabou.jp）で管理コンソール → 「通報管理」→ 通報が届いている画面 → 「依頼を取り消す」「アカウント停止」「対応済みにする」を操作

撮影後、動画をGoogle Drive等にアップし「リンクを知っている全員が閲覧可」にして、App Review情報のメモ欄にURLを貼る。

---

## ③ 再提出の手順

1. App Store Connect → 却下されたビルドのページ → App Review への返信（Resolution Center）に上記①を貼る
2. 画面録画リンクを App Review情報のメモに追加
3. 「審査に再提出」
