# NARABOU Android版（Google Play）リリース手順

iOS版と同じ「ライブ配信型」（https://app.narabou.jp をWebViewで表示）です。
設定は `capacitor.config.ts` に既に含まれているので、Android側の追加設定はほぼ不要です。

---

## 0. 前提（iOS版でやったことと同じ流れ）

- パッケージ名: `jp.narabou.app`（iOSと同じ名前でOK。別ストアなので衝突しません）
- リポジトリ: https://github.com/komakokengo-star/narabou.git
- `android/` フォルダは `.gitignore` 済み（Mac側で生成）

---

## 1. Google Play Console 開発者アカウント登録（最初にやる／時間がかかる）

1. https://play.google.com/console にGoogleアカウントで登録
2. **登録料 $25（一度きり）** — クレジットカード
3. 本人確認（身分証アップロード）→ **承認に数日かかることがあります**
   → まずこれを始めて、待つ間にMac側の準備を進めるのが効率的です
4. 「デベロッパー名」は **HIFUNON**（iOSと揃える）を推奨

## 2. MacinCloud に Android Studio を入れる

1. https://developer.android.com/studio から Mac (Apple Silicon) 版をダウンロード
2. インストールして初回起動 → Setup Wizard（SDKのダウンロード）を完了させる
   ※ MacinCloudはディスク容量に注意。不要なファイルがあれば消してから

## 3. プロジェクトのセットアップ（Macのターミナル）

iOS版と同じ要領で:

```bash
git pull
npm install
npm run android:setup    # android/ フォルダ生成 + 同期 + アイコン/スプラッシュ生成
npm run android:open     # Android Studio が開く
```

以後のWeb側更新の反映は `npm run android:sync` だけ（中身はライブサイトなので基本不要）。

## 4. 署名キー（keystore）を作る ← 最重要・絶対に無くさない

Android Studio で:

1. メニュー **Build → Generate Signed App Bundle / APK**
2. **Android App Bundle** を選択 → Next
3. **Create new…** でキーストアを作成
   - Key store path: 保存しやすい場所（例: `Documents/narabou-upload.keystore`）
   - Alias: `narabou`
   - Password: **必ず自分で管理（パスワード管理ツール等に記録）**
   - Validity: 25年以上（デフォルトのまま）
   - 証明書情報: 名前 `HIFUNON`、組織など任意
4. このキーストア（.keystoreファイル）とパスワードを**無くすとアプリを更新できません**
   → MacinCloudに置きっぱなしにせず、自分のPC/クラウドにもバックアップ

コマンドで作る場合:

```bash
keytool -genkey -v -keystore narabou-upload.keystore -alias narabou -keyalg RSA -keysize 2048 -validity 10000
```

## 5. AAB（アップロード用ファイル）を作る

1. **Build → Generate Signed App Bundle / APK → Android App Bundle**
2. 作成したkeystore + パスワードを入力 → Next
3. **release** を選択 → Create
4. 出力先: `android/app/release/app-release.aab`
   （署名なしの `bundleDebug` は使わない。Play App Signing にGoogle側管理を任せるので、この「upload key」で署名したAABだけでOK）

※ 初回ビルドはGradleのダウンロードで10〜30分かかります。

## 6. Play Console でアプリを作成

1. 「アプリを作成」→ 名前 **NARABOU**、言語 **日本語**、
   **アプリ** / **無料** にチェック
2. 「アプリのコンテンツ」系の宣言は後から赤いチェックリストで案内されます

### ストアの掲載情報

| 項目 | 内容 |
|---|---|
| アプリ名 | NARABOU（30文字以内） |
| 簡単な説明（80文字以内） | 「行列に並ぶ時間を、大切な時間に。福岡の行列代行アプリNARABOU。人気店の行列を代わりに並んで順番をお知らせします。」 |
| 詳しい説明（4000文字以内） | iOS版の「概要」をそのまま流用可 |
| アイコン 512×512 | Files の `narabou-play-store/app-icon-512.png` |
| メインのグラフィック 1024×500 | Files の `narabou-play-store/feature-graphic-1024x500.png` |
| スクリーンショット | **スマホ2枚以上（必須）**。Android実機/エミュレータで https://app.narabou.jp を開いて撮るのが確実。iOS用の縦のスクリーンショット（1080×1920程度にリサイズ）でも可 |
| ウェブサイト | https://app.narabou.jp |
| プライバシーポリシー | https://app.narabou.jp/privacy |
| メールアドレス | info@narabou.jp |

### アプリのコンテンツ（宣言系）

- **広告**: 広告は含まない → いいえ
- **アプリの内容（コンテンツレーティング）**: IARCアンケート。
  iOSと同じく「ユーザーによるコンテンツの交換あり（コメント）」で回答。
  暴力・性的・ギャンブル等はすべて「いいえ」
- **ターゲット対象年齢**: 13歳以上（18歳以上でも可。「13歳未満」にはチェックしない）
- **データの安全性**: iOSの「App Privacy」と同じ内容を申告
  - 収集する: メールアドレス / 氏名 / 電話番号 / おおよその位置情報 / 写真 / ユーザー生成コンテンツ / ユーザーID / 購入履歴
  - すべて「アプリの機能」のため、ユーザーに紐づく=はい、共有=いいえ
- **プライバシーポリシー**: https://app.narabou.jp/privacy
- **ログイン情報（審査用）**: iOSと同じ `review@narabou.jp` + パスワード
  （「アプリへのアクセス」→「すべてのユーザーが利用できる」or 認証情報を入力）

## 7. リリース

1. **テスト（推奨）**: テスティング → 内部テスト → 新しいリリース → AABをアップロード
   自分のGoogleアカウントをテスター登録 → 実機/エミュレータで動作確認
2. **本番**: リリース → 本番環境 → 新しいリリースを作成 → AABをアップロード
   - リリースノート例: 「初回リリース」
   - 国: 日本（配布国で選択）
3. 審査: **数時間〜7日程度**（初回は長め）

## 8. iOS版との主な違い・注意

- **決済**: iOSと同じ理屈で、Stripeによる「現地での行列代行」という実サービスへの支払いは
  Google Play Billing の対象外（現実世界のサービス）。申告で「アプリ内課金なし」でOK
- **Minimum Functionality ポリシー**: Googleは「WebViewでサイトを表示しただけ」のアプリを
  拒否することがあります。iOSの審査メモと同じ趣旨で、
  説明欄・審査メモに「ネイティブプッシュ通知・位置情報・カメラなど端末機能と連携した
  行列代行サービスの専用クライアント」と伝わるようにしておくと安全です
- **ターゲットAPIレベル**: Capacitor 8 / 最新のAndroid Studioで生成すれば
  Playの要求（API 35+）を自動的に満たします。古いAndroid Studioは使わない
- **プッシュ通知**: Web版と同じFCM実装がWebView内で動きます。
  もしAndroidアプリ内で通知が届かない場合は、ネイティブFCM連携の追加で対応できるので相談してください
- **更新の流れ**: Web側の修正は再申請不要（ライブサイトがそのまま反映）。
  ネイティブ側（アイコン・SDK等）を変えたときだけ新しいAABをアップロード

## 9. よくあるエラー

- `Upload failed: You need to use a different version code` →
  `android/app/build.gradle` の `versionCode` を+1してからビルド
- 署名エラー → keystoreのパスワード/エイリアス確認。Generate Signed Bundle で作り直す
- Gradle同期エラー → MacinCloudのネットワーク/ディスク容量確認、File → Sync Project with Gradle Files
