import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BASE_FEE, TIME_BLOCK_FEE, PEAK_FEE } from "@/lib/fees";
import { Clock, MapPin, ShieldCheck, Users } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "福岡行列代行 — 博多・天神の行列、並ぶのは私たち" },
      { name: "description", content: "基本800円+10分200円。ピーク時は+300円。決済・追加課金・返金もアプリで完結。" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="container mx-auto px-4 pt-16 pb-12 sm:pt-24 sm:pb-20">
          <div className="max-w-3xl">
            <p className="text-xs tracking-[0.3em] text-primary uppercase mb-4">福岡 · ベータ版</p>
            <h1 className="font-serif text-4xl sm:text-6xl font-bold leading-tight">
              {t("app.name")}
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl">
              {t("app.tagline")}
            </p>
            <div className="mt-10 flex gap-3">
              <Link to="/auth">
                <Button size="lg" className="rounded-full px-8">はじめる</Button>
              </Link>
              <Link to="/dashboard">
                <Button size="lg" variant="outline" className="rounded-full px-8">ダッシュボード</Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-12">
          <h2 className="font-serif text-2xl sm:text-3xl mb-8">明朗会計</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <FeeCard label="基本料金" value={`¥${BASE_FEE}`} hint="現地到着で確定" />
            <FeeCard label="時間課金" value={`¥${TIME_BLOCK_FEE} / 10分`} hint="切上げ計算" />
            <FeeCard label="ピーク料金" value={`+¥${PEAK_FEE}`} hint="混雑時のみ" />
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            運営手数料 20% / 代行者報酬 80%。Stripe テストモードで動作。
          </p>
        </section>

        <section className="container mx-auto px-4 py-12 grid sm:grid-cols-4 gap-4">
          <Feature icon={<Users className="w-5 h-5" />} title="3ロール" desc="依頼者・代行者・管理者" />
          <Feature icon={<MapPin className="w-5 h-5" />} title="定点報告" desc="位置情報＋写真" />
          <Feature icon={<Clock className="w-5 h-5" />} title="延長/返金" desc="アプリで完結" />
          <Feature icon={<ShieldCheck className="w-5 h-5" />} title="本人確認" desc="代行者を審査" />
        </section>
      </main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © 福岡行列代行 — Beta
      </footer>
    </div>
  );
}

function FeeCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="p-6">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-serif text-3xl mt-2">{value}</div>
      <div className="text-xs text-muted-foreground mt-2">{hint}</div>
    </Card>
  );
}
function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-md bg-accent text-accent-foreground flex items-center justify-center shrink-0">{icon}</div>
      <div>
        <div className="font-medium text-sm">{title}</div>
        <div className="text-xs text-muted-foreground mt-1">{desc}</div>
      </div>
    </div>
  );
}
