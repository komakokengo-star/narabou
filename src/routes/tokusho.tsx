import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Store } from "lucide-react";

export const Route = createFileRoute("/tokusho")({
  head: () => ({
    meta: [
      { title: "特定商取引法に基づく表記 — ＮＡＲＡＢＯＵ" },
      { name: "description", content: "福岡行列代行サービスアプリ「ＮＡＲＡＢＯＵ」の特定商取引法に基づく表記です。事業者情報、料金、決済・キャンセルポリシーなどを定めます。" },
      { property: "og:title", content: "特定商取引法に基づく表記 — ＮＡＲＡＢＯＵ" },
      { property: "og:description", content: "福岡行列代行サービスアプリ「ＮＡＲＡＢＯＵ」の特定商取引法に基づく表記です。" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://app.narabou.jp/tokusho" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://app.narabou.jp/tokusho" }],
  }),

  component: TokushoPage,
});

function TokushoPage() {
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
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold">特定商取引法に基づく表記</h1>
              <p className="text-sm text-muted-foreground mt-1">発効日：2026年7月10日</p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-8">
            本ページは、HIFUNON が運営するインターネット通販（サービス提供）に関する「特定商取引法に基づく表記」です。
          </p>

          <Card className="p-6 sm:p-8">
            <dl className="space-y-8 text-sm">
              <DisclosureItem term="事業者の名称">
                HIFUNON
              </DisclosureItem>

              <DisclosureItem term="代表者">
                藤井 健吾
              </DisclosureItem>

              <DisclosureItem term="所在地">
                〒810-0003<br />
                福岡県福岡市中央区春吉2-5-1
              </DisclosureItem>

              <DisclosureItem term="連絡先">
                <div className="space-y-1">
                  <p>電話番号：090-2500-3143</p>
                  <p>メールアドレス：<a href="mailto:info@narabou.jp" className="underline hover:text-foreground">info@narabou.jp</a></p>
                  <p>営業時間：9:00〜18:00（土日祝日を除く）</p>
                  <p className="text-xs text-muted-foreground">※メールでのお問い合わせは24時間受け付けております。</p>
                </div>
              </DisclosureItem>

              <DisclosureItem term="サービス名">
                ＮＡＲＡＢＯＵ（福岡行列代行サービスアプリ）
              </DisclosureItem>

              <DisclosureItem term="販売価格">
                <div className="space-y-1">
                  <p>基本料金：800円（税込）</p>
                  <p>時間課金：10分ごとに200円（税込、切り上げ計算）</p>
                  <p>ピーク料金：基本料金に+300円（税込）</p>
                  <p>延長課金：依頼者承認時に10分ごとに200円（税込）</p>
                  <p>運営手数料：依頼総額の20%</p>
                  <p className="text-xs text-muted-foreground">※具体例はアプリ内の料金シミュレーターでご確認ください。</p>
                </div>
              </DisclosureItem>

              <DisclosureItem term="支払い方法">
                クレジットカード決済（Stripe を利用）
              </DisclosureItem>

              <DisclosureItem term="支払い時期">
                依頼が成立し、依頼者が決済を承認した時点で、お客様の指定するクレジットカードにて決済が行われます。
              </DisclosureItem>

              <DisclosureItem term="サービスの提供時期">
                依頼者と代行者のマッチングが成立し、代行者が現地到着報告を行った時点からサービス提供を開始します。
              </DisclosureItem>

              <DisclosureItem term="キャンセル・返金について">
                <div className="space-y-1">
                  <p>代行者が現地到着前：無料キャンセル</p>
                  <p>現地到着後：基本料金800円を請求</p>
                  <p>待機開始後：経過時間に応じた時間課金を請求</p>
                  <p>延長承認後のキャンセル：延長分も含めて請求</p>
                  <p className="text-xs text-muted-foreground mt-2">詳細は<Link to="/terms" className="underline hover:text-foreground">利用規約</Link>をご確認ください。</p>
                </div>
              </DisclosureItem>

              <DisclosureItem term="動作環境">
                インターネット接続環境が必要です。推奨ブラウザ：Google Chrome、Safari、Microsoft Edge、Firefox の最新版。
              </DisclosureItem>

              <DisclosureItem term="特別な販売条件">
                特になし。
              </DisclosureItem>
            </dl>
          </Card>

          <div className="mt-8 text-center">
            <p className="text-xs text-muted-foreground">
              ご不明な点がございましたら、<a href="mailto:info@narabou.jp" className="underline hover:text-foreground">info@narabou.jp</a> までお問い合わせください。
            </p>
          </div>
        </section>
      </main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © HIFUNON — ＮＡＲＡＢＯＵ
      </footer>
    </div>
  );
}

function DisclosureItem({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border pb-6 last:border-0 last:pb-0">
      <dt className="font-medium text-foreground mb-2">{term}</dt>
      <dd className="leading-relaxed text-foreground/90">{children}</dd>
    </div>
  );
}
