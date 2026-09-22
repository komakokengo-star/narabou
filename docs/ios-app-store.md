# NARABOU iOSアプリ（App Store）作業手順

方式: **公開サイト（https://app.narabou.jp）をアプリの中で表示するライブ配信型**。
Web側を更新すればアプリの中身も自動で最新になります（再申請不要）。

---

## Mac（MacinCloud）でやること — 初回だけ

ターミナルを開いて、上から順にコピペするだけです。

```bash
# 1. プロジェクトを取得（すでに取得済みならスキップ）
git clone <このプロジェクトのGitHub URL> narabou
cd narabou

# 2. 必要なものを入れる
npm install
sudo gem install cocoapods    # 入っていなければ

# 3. iOSアプリを生成 + アイコン/起動画面を自動生成
npm run ios:setup

# 4. Xcodeで開く
npm run ios:open
```

`npm run ios:setup` が終わると `ios/` フォルダが出来ます。
**`ios/` はGitに入れず、Mac側にだけ置いてOK**（毎回作り直せます）。

## Mac でやること — 2回目以降（コード更新時）

```bash
git pull
npm install
npm run ios:sync
npm run ios:open
```

---

## Xcode 側の設定（初回のみ・5分）

1. 左のツリーで一番上の **App** を選択 → **Signing & Capabilities** タブ
2. **Team** に自分のApple Developerアカウントを選択
3. **Automatically manage signing** にチェック
4. Bundle Identifier が `jp.narabou.app` になっていることを確認
5. `+ Capability` から次を追加
   - **Push Notifications**
   - **Background Modes** →「Remote notifications」にチェック

### 権限の説明文（Info.plist）

Xcode左ツリーの `App/Info.plist` を開き、以下を追加します（右クリック → Add Row）。
**この文言が無いとApp Store審査でリジェクトされます。**

| キー | 値（そのままコピー可） |
|---|---|
| Privacy - Location When In Use Usage Description | 現地到着の報告と、依頼場所までの距離確認のために現在地を使用します。 |
| Privacy - Camera Usage Description | 並び状況の写真を撮影して報告するためにカメラを使用します。 |
| Privacy - Photo Library Usage Description | 報告用の写真を選択するために写真へアクセスします。 |
| Privacy - Photo Library Additions Usage Description | 撮影した報告写真を保存するために写真へアクセスします。 |

---

## App Store 提出の流れ

1. **App Store Connect** (https://appstoreconnect.apple.com) で新規App作成
   - 名前: NARABOU / 言語: 日本語 / バンドルID: `jp.narabou.app`
   - SKU: `narabou-ios-001`
2. Xcode 上部のデバイス選択で **Any iOS Device (arm64)** を選ぶ
3. メニュー **Product → Archive**
4. 完了したら **Distribute App → App Store Connect → Upload**
5. App Store Connect側で、スクリーンショット・説明文・プライバシー情報を入力して審査提出

### 審査で必要になるもの（事前に準備）

- スクリーンショット（6.7インチ必須：1290×2796px、3〜5枚）
- プライバシーポリシーURL: https://app.narabou.jp/privacy
- サポートURL: https://app.narabou.jp
- **審査用テストアカウント**（メール＋パスワード）— ログインが必要なアプリは必須
- 収集データの申告：位置情報、写真、メールアドレス、購入履歴

### 注意（リジェクト回避）

- 「ただサイトを表示するだけ」と判断されないよう、位置情報・カメラ・プッシュ通知といった
  端末機能を使っていることを審査メモに明記してください。
- Stripe決済は「現実世界のサービス（行列代行）」への支払いなので、
  Appleアプリ内課金（30%）の対象外です。審査メモにもその旨を書いてください。

---

## よくあるエラー

| 症状 | 対処 |
|---|---|
| `pod: command not found` | `sudo gem install cocoapods` |
| `No such module 'Capacitor'` | `cd ios/App && pod install` のあとXcodeを開き直す |
| 白い画面のまま | ネットワーク。`capacitor.config.ts` の `server.url` が正しいか確認 |
| Signing エラー | Team未選択。Xcode → Signing & Capabilities で選ぶ |
| ログイン後に画面が動かない | Safariで https://app.narabou.jp が正常か先に確認 |
