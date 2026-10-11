<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- The public auth route accepts only an allowlisted `/account-deletion` return destination, so account deletion login returns safely without enabling open redirects.

## UGC安全対策（App Store Guideline 1.2）
- 通報は public.reports、ブロックは public.blocks、アカウント停止は profiles.suspended_at。通報・ブロックUIは src/components/ReportBlock.tsx に集約し、依頼/案件詳細ページから使う。停止ユーザーの強制ログアウトは _authenticated/route.tsx の beforeLoad で行う。

## 広告計測（LINEヤフー広告）
- Yahoo!広告のコンバージョン送信は src/lib/yahoo-ads.ts 経由のみ。ytag.js は window.ytag を定義せず window.yjDataLayer キューを処理するだけなので、ytag() は push(arguments) 形式（要素は [config]）で積むこと。config を直接 push するとエラー 없이 黙って計測されない。
