import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { ArrowLeft, FileText } from "lucide-react";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "利用規約 — ＮＡＲＡＢＯＵ" },
      { name: "description", content: "福岡行列代行サービスアプリ「ＮＡＲＡＢＯＵ」の利用規約です。依頼者・代行者・管理者の権利義務を定めます。" },
      { property: "og:title", content: "利用規約 — ＮＡＲＡＢＯＵ" },
      { property: "og:description", content: "福岡行列代行サービスアプリ「ＮＡＲＡＢＯＵ」の利用規約です。" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://app.narabou.jp/terms" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://app.narabou.jp/terms" }],
  }),

  component: TermsPage,
});

function TermsPage() {
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
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold">利用規約</h1>
              <p className="text-sm text-muted-foreground mt-1">発効日：2026年7月10日</p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-8">
            本ページは HIFUNON が管理する、ＮＡＲＡＢＯＵ（福岡行列代行サービスアプリ）に関する一般的な利用条件を示したものです。法的拘束力を伴う正式な契約書ではなく、最新の内容はアプリ内の表示をご確認ください。
          </p>

          <Card className="p-6 sm:p-8 space-y-10">
            <Article number="第1条" title="総則">
              <p>本規約は、福岡行列代行サービスアプリ「ＮＡＲＡＢＯＵ」（以下「本サービス」）の利用条件を定めるものとします。</p>
              <p>本規約は、依頼者・代行者・管理者のすべてのユーザーに適用されます。</p>
            </Article>

            <Article number="第2条" title="定義">
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>依頼者</strong>：行列代行を依頼するユーザーをいいます。</li>
                <li><strong>代行者</strong>：行列に並ぶ業務を行うユーザーをいいます（業務委託契約の関係）。</li>
                <li><strong>管理者</strong>：本サービスの運営・管理を行う HIFUNON をいいます。</li>
                <li><strong>サービス</strong>：行列代行のマッチング、決済、報告などの機能をいいます。</li>
              </ul>
            </Article>

            <Article number="第3条" title="禁止事項">
              <p>ユーザーは以下の行為を行ってはなりません。</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>店舗の利用規約に反する行為</li>
                <li>店舗前での迷惑行為（割り込み、場所取り、通行妨害など）</li>
                <li>依頼者と代行者が本サービスを介さずに直接取引をする行為</li>
                <li>虚偽の報告、なりすまし、その他不正な行為</li>
                <li>暴言、ハラスメント、その他の嫌がらせ行為</li>
                <li>不正決済、返金詐欺、その他の経済的な不正行為</li>
              </ul>
            </Article>

            <Article number="第4条" title="代行者の業務委託">
              <p>代行者は本サービスを通じて個別の行列代行業務を受託する「業務委託」の関係にあり、HIFUNON との間に雇用関係は存在しません。</p>
              <p>代行者への報酬は、依頼総額の80%とします。残りの20%は管理者の手数料といたします。</p>
              <p>依頼者による評価制度により、今後の受注制限が発生する場合があります。</p>
              <p>代行者は本人確認のため、身分証明書をアップロードすることが必須です。</p>
            </Article>

            <Article number="第5条" title="料金体系">
              <p>本サービスの料金は以下の通りです。料金計算式はアプリ内にも明示します。</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>基本料金：800円</li>
                <li>時間課金：10分ごとに200円（切り上げ計算）</li>
                <li>ピーク料金：+300円</li>
                <li>延長課金：依頼者承認時に10分ごとに200円</li>
                <li>運営手数料：依頼総額の20%</li>
              </ul>
            </Article>

            <Article number="第6条" title="キャンセルポリシー">
              <p>依頼のキャンセルに伴う請求は、以下の通りとします。</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>代行者が現地到着前：無料キャンセル</li>
                <li>現地到着後：基本料金800円を請求</li>
                <li>待機開始後：経過時間に応じた時間課金を請求</li>
                <li>延長承認後のキャンセル：延長分も含めて請求</li>
              </ul>
              <p>管理者は運営上必要な場合、依頼を強制キャンセルできるものとします。</p>
            </Article>

            <Article number="第7条" title="決済・返金">
              <p>本サービスの決済は Stripe を利用して処理されます。</p>
              <p>返金は Stripe Refund API を通じて行われます。</p>
              <p>決済が失敗した場合、依頼は成立せず、マッチングは解除されます。</p>
              <p>不正決済が疑われる場合、管理者は利用停止等の措置を講じることができます。</p>
            </Article>

            <Article number="第8条" title="位置情報">
              <p>代行者は定点報告時に位置情報を送信します。</p>
              <p>安全上の理由から、依頼者に表示される位置情報は50〜100m程度の誤差を含んだ概算位置とします。</p>
              <p>依頼者は代行者の正確な位置情報を要求することはできません。</p>
            </Article>

            <Article number="第9条" title="免責事項">
              <p>本サービスは以下について保証せず、またこれらに起因する損害について補償しません。</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>行列の長さや待ち時間</li>
                <li>店舗との間で生じたトラブル（当事者間で解決するものとします）</li>
                <li>天候・災害・交通事情等による遅延</li>
                <li>サービス停止・障害等による損害</li>
              </ul>
            </Article>

            <Article number="第10条" title="アカウント停止">
              <p>規約違反、迷惑行為、詐欺行為その他の不正行為があった場合、管理者は当該ユーザーのアカウントを停止・削除できるものとします。</p>
            </Article>

            <Article number="第11条" title="準拠法">
              <p>本規約の解釈にあたっては、日本法に準拠するものとします。</p>
              <p>本サービスに関わる紛争については、HIFUNON の本店所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。</p>
            </Article>
          </Card>

          <div className="mt-8 text-center">
            <p className="text-xs text-muted-foreground">
              ご不明な点がございましたら、<a href="mailto:info@narabou.jp" className="underline hover:text-foreground">info@narabou.jp</a> までお問い合わせください。
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
