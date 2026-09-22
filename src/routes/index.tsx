import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import appI18n from "../i18n";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BASE_FEE, TIME_BLOCK_FEE, PEAK_FEE } from "@/lib/fees";
import { Clock, MapPin, ShieldCheck, Users } from "lucide-react";
import queueIllustration from "@/assets/narabou-queue-illustration.jpg.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: appI18n.t("app.metaTitle") },
      { name: "description", content: appI18n.t("app.metaDescription") },
      { property: "og:title", content: appI18n.t("app.metaTitle") },
      { property: "og:description", content: appI18n.t("app.metaDescription") },
      { property: "og:url", content: "https://app.narabou.jp/" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: appI18n.t("app.metaTitle") },
      { name: "twitter:description", content: appI18n.t("app.metaDescription") },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1514279e-988c-4d3e-8dfe-afab2bacef0a/id-preview-727c5693--bc84fda8-23a4-4dfd-8a53-fea4e73274e7.lovable.app-1783149629848.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1514279e-988c-4d3e-8dfe-afab2bacef0a/id-preview-727c5693--bc84fda8-23a4-4dfd-8a53-fea4e73274e7.lovable.app-1783149629848.png" },
    ],
    links: [{ rel: "canonical", href: "https://app.narabou.jp/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Service",
          name: "ＮＡＲＡＢＯＵ 行列代行サービス",
          serviceType: "行列代行（並び代行）",
          provider: { "@type": "Organization", name: "ＮＡＲＡＢＯＵ", url: "https://app.narabou.jp" },
          areaServed: { "@type": "City", name: "福岡市" },
          url: "https://app.narabou.jp/",
          offers: {
            "@type": "Offer",
            priceCurrency: "JPY",
            price: String(BASE_FEE),
            description: `基本料金¥${BASE_FEE}、10分ごと¥${TIME_BLOCK_FEE}、ピーク時+¥${PEAK_FEE}`,
          },
        }),
      },
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
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div className="max-w-3xl">
              <p className="text-sm sm:text-base tracking-[0.2em] text-primary uppercase mb-5 font-medium">
                {t("app.heroSubtitle")}
              </p>
              <h1 className="font-serif text-5xl sm:text-7xl font-bold leading-[1.05] tracking-[0.02em]">
                ＮＡＲＡＢＯＵ
                <span className="mt-3 block font-sans text-xl sm:text-2xl font-medium tracking-normal text-muted-foreground">
                  {t("app.heroSubtitle")}
                </span>
              </h1>

              <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl whitespace-pre-line">
                {t("app.tagline")}
              </p>
              <div className="mt-10 flex gap-3">
                <Link to="/auth">
                  <Button size="lg" className="rounded-full px-8">{t("app.startButton")}</Button>
                </Link>
                <Link to="/dashboard">
                  <Button size="lg" variant="outline" className="rounded-full px-8">{t("app.menuButton")}</Button>
                </Link>
              </div>
            </div>
            <div className="relative order-first lg:order-last">
              <img
                src={queueIllustration.url}
                alt="福岡・薬院の人気店で行列に並ぶNARABOUのイラスト"
                className="w-full rounded-2xl shadow-lg object-cover"
                loading="lazy"
              />
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-12">
          <h2 className="font-serif text-2xl sm:text-3xl mb-8">{t("fees.transparentTitle")}</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <FeeCard label={t("fees.base")} value={`¥${BASE_FEE}`} hint={t("fees.baseHint")} />
            <FeeCard label={t("fees.time")} value={`¥${TIME_BLOCK_FEE} / 10${t("common.minute")}`} hint={t("fees.timeHint")} />
            <FeeCard label={t("fees.peak")} value={`+¥${PEAK_FEE}`} hint={t("fees.peakHint")} />
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            {t("fees.disclaimer")}
          </p>
        </section>

        <section className="container mx-auto px-4 py-12 grid sm:grid-cols-4 gap-4">
          <Feature icon={<Users className="w-5 h-5" />} title={t("features.threeRoles")} desc={t("features.threeRolesDesc")} />
          <Feature icon={<MapPin className="w-5 h-5" />} title={t("features.checkin")} desc={t("features.checkinDesc")} />
          <Feature icon={<Clock className="w-5 h-5" />} title={t("features.extensionRefund")} desc={t("features.extensionRefundDesc")} />
          <Feature icon={<ShieldCheck className="w-5 h-5" />} title={t("features.verification")} desc={t("features.verificationDesc")} />
        </section>
      </main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground space-y-2">
        <div className="flex items-center justify-center gap-4">
          <Link to="/terms" className="hover:text-foreground">{t("footer.terms")}</Link>
          <Link to="/privacy" className="hover:text-foreground">{t("footer.privacy")}</Link>
          <Link to="/tokusho" className="hover:text-foreground">{t("footer.tokusho")}</Link>
        </div>
        <div>{t("footer.copyright")}</div>
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
