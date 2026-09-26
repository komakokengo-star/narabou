import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount } from "@/lib/account.functions";

const URL_ = "https://app.narabou.jp/account-deletion";

export const Route = createFileRoute("/account-deletion")({
  head: () => ({
    meta: [
      { title: "アカウント削除 — ＮＡＲＡＢＯＵ" },
      { name: "description", content: "ＮＡＲＡＢＯＵのアカウントと関連データを削除する方法をご案内します。" },
      { property: "og:title", content: "アカウント削除 — ＮＡＲＡＢＯＵ" },
      { property: "og:description", content: "ＮＡＲＡＢＯＵのアカウントと関連データの削除方法。" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL_ },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: URL_ }],
  }),
  component: AccountDeletionPage,
});

function AccountDeletionPage() {
  const navigate = useNavigate();
  const del = useServerFn(deleteMyAccount);
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let done = false;
    const finish = (mail: string | null) => {
      if (done) return;
      done = true;
      setEmail(mail);
      setReady(true);
    };
    supabase.auth.getSession()
      .then(({ data }) => finish(data.session?.user.email ?? null))
      .catch(() => finish(null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      finish(session?.user.email ?? null);
    });
    // セッション確認が応答しない場合でも必ず表示を進める
    const timer = setTimeout(() => finish(null), 5000);
    return () => {
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  const onDelete = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await del();
      if (res.ok) {
        await supabase.auth.signOut();
        setEmail(null);
        setMsg("アカウントを削除しました。ご利用ありがとうございました。");
        setTimeout(() => navigate({ to: "/" }), 2500);
      } else if (res.reason === "active") {
        setMsg("進行中の依頼または代行があります。完了またはキャンセルしてから、もう一度お試しください。");
      } else {
        setMsg("削除できませんでした。時間をおいて再度お試しいただくか、info@narabou.jp までご連絡ください。");
      }
    } catch {
      setMsg("削除できませんでした。もう一度ログインしてからお試しください。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="container mx-auto px-4 py-10 sm:py-16 max-w-2xl">
          <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8">
            <ArrowLeft className="w-4 h-4 mr-1" />
            ホームに戻る
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">アカウント削除</h1>
          <p className="text-sm text-muted-foreground mb-8">Delete your NARABOU account</p>

          <Card className="p-6 space-y-4 mb-6">
            <h2 className="font-semibold">削除されるデータ</h2>
            <ul className="list-disc pl-5 text-sm space-y-1">
              <li>アカウント情報（メールアドレス・ログイン情報）</li>
              <li>プロフィール、通知設定、端末の通知登録</li>
              <li>依頼・代行の履歴、位置情報のチェックイン記録</li>
            </ul>
            <p className="text-sm text-muted-foreground">
              決済の記録は、法令（税務・会計）で保存が義務づけられている範囲で、決済代行会社（Stripe）に保管される場合があります。削除は取り消せません。
            </p>
          </Card>

          <Card className="p-6 space-y-4">
            <h2 className="font-semibold">削除の手順</h2>
            <ol className="list-decimal pl-5 text-sm space-y-1">
              <li>ＮＡＲＡＢＯＵにログインします</li>
              <li>このページ（{URL_}）を開きます</li>
              <li>「アカウントを削除する」を押し、確認画面で「削除する」を押します</li>
            </ol>

            {!ready ? null : email ? (
              <div className="space-y-3 pt-2">
                <p className="text-sm">
                  ログイン中：<span className="font-medium">{email}</span>
                </p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={busy}>
                      <Trash2 className="w-4 h-4 mr-2" />
                      アカウントを削除する
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>本当に削除しますか？</AlertDialogTitle>
                      <AlertDialogDescription>
                        アカウントと関連データはすべて消え、元に戻せません。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>やめる</AlertDialogCancel>
                      <AlertDialogAction onClick={onDelete}>削除する</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ) : (
              <div className="pt-2">
                <Button asChild>
                  <Link to="/auth">ログインして削除する</Link>
                </Button>
              </div>
            )}

            {msg && <p className="text-sm font-medium pt-2">{msg}</p>}

            <p className="text-xs text-muted-foreground pt-2">
              ログインできない場合は、登録メールアドレスから info@narabou.jp へ「アカウント削除希望」とご連絡ください。
            </p>
          </Card>
        </section>
      </main>
    </div>
  );
}
