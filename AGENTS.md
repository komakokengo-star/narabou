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
