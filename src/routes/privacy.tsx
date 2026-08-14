import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Shield } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "プライバシーポリシー — ＮＡＲＡＢＯＵ" },
      { name: "description", content: "福岡行列代行サービスアプリ「ＮＡＲＡＢＯＵ」のプライバシーポリシーです。個人情報の取り扱いについて定めます。" },
      { property: "og:title", content: "プライバシーポリシー — ＮＡＲＡＢＯＵ" },
      { property: "og:description", content: "福岡行列代行サービスアプリ「ＮＡＲＡＢＯＵ」のプライバシーポリシーです。" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://app.narabou.jp/privacy" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://app.narabou.jp/privacy" }],
  }),

  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="container mx-auto px-4 py-10 sm:py-16 max-w-3xl">
          <div className="mb-8">
            <Link
              to="/"
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              ホームに戻る
            </Link>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold">プライバシーポリシー</h1>
              <p className="text-sm text-muted-foreground mt-1">発効日：2026年7月10日</p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-8">
            本ページは HIFUNON が管理する、ＮＡＲＡＢＯＵ（福岡行列代行サービスアプリ）における個人情報の取り扱いについて説明するものです。最新の内容はアプリ内の表示をご確認ください。
          </p>

          <Card className="p-6 sm:p-8 space-y-10">
            <Article number="第1条" title="総則">
              <p>本ポリシーは、本サービスを利用するユーザー（依頼者・代行者・管理者を含みます）の個人情報の取り扱いを定めるものとします。</p>
              <p>HIFUNON は、ユーザーの個人情報を適切に保護し、利用目的の範囲内で利用することをお約束します。</p>
            </Article>

            <Article number="第2条" title="取得する情報">
              <p>本サービスでは、以下の情報を取得する場合があります。</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>氏名、メールアドレス、電話番号</li>
                <li>本人確認書類（代行者のみ）</li>
                <li>位置情報（代行者の定点報告時に取得）</li>
                <li>決済情報（Stripe を通じて処理されます）</li>
                <li>依頼者と代行者間のチャット内容</li>
                <li>利用履歴、アクセスログ</li>
              </ul>
            </Article>

            <Article number="第3条" title="利用目的">
              <p>取得した個人情報は、以下の目的で利用します。</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>行列代行サービスの提供</li>
                <li>依頼者と代行者のマッチング、決済、返金処理</li>
                <li>不正防止および本人確認</li>
                <li>トラブル対応</li>
                <li>サービス改善のための分析</li>
              </ul>
            </Article>

            <Article number="第4条" title="第三者提供">
              <p>ユーザーの個人情報は、以下の場合を除き、第三者に提供することはありません。</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Stripe（決済処理のため）</li>
                <li>Supabase（データベース運用のため）</li>
                <li>法令に基づく場合</li>
              </ul>
            </Article>

            <Article number="第5条" title="位置情報の扱い">
              <p>代行者の位置情報は、依頼者に対して50〜100m程度の誤差を含んだ概算位置として表示されます。</p>
              <p>正確な位置情報を保存・表示することはありません。</p>
              <p>依頼者は代行者の正確な位置情報を要求することはできません。</p>
            </Article>

            <Article number="第6条" title="安全管理">
              <p>個人情報の保護のため、以下の措置を講じます。</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>通信の暗号化（HTTPS/TLS）</li>
                <li>本人確認書類は安全に保管し、第三者提供は行いません</li>
                <li>不正アクセス防止のための技術的・管理的措置</li>
              </ul>
            </Article>

            <Article number="第7条" title="Cookie・ログ">
              <p>本サービスでは、利用状況の分析のために Cookie を使用する場合があります。</p>
              <p>Cookie は個人を特定する目的では利用しません。</p>
            </Article>

            <Article number="第8条" title="ユーザーの権利">
              <p>ユーザーは、自己に関する個人情報の開示・訂正・削除を請求することができます。</p>
              <p>アカウント削除時には、法令に基づく保存義務を除き、関連する個人データを消去します。</p>
            </Article>

            <Article number="第9条" title="改定">
              <p>本ポリシーは、必要に応じて改定されることがあります。</p>
              <p>改定時は、アプリ内での告知をもって発効します。</p>
            </Article>
          </Card>

          <div className="mt-8 text-center">
            <p className="text-xs text-muted-foreground">
              個人情報に関するお問い合わせは、<a href="mailto:info@narabou.jp" className="underline hover:text-foreground">info@narabou.jp</a> までお願いします。
            </p>
          </div>
        </section>
      </main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © HIFUNON — ＮＡＲＡＢＯＵ Beta
      </footer>
    </div>
  );
}

function Article({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="font-serif text-xl font-bold mb-3">
        {number}（{title}）
      </h2>
      <div className="text-sm leading-relaxed text-foreground/90 space-y-2">
        {children}
      </div>
    </div>
  );
}
