import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import appI18n from "../i18n";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BASE_FEE, TIME_BLOCK_FEE, PEAK_FEE } from "@/lib/fees";
import { Clock, MapPin, ShieldCheck, Users } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: appI18n.t("app.metaTitle") },
      { name: "description", content: appI18n.t("app.metaDescription") },
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
            <p className="text-sm sm:text-base tracking-[0.2em] text-primary uppercase mb-5 font-medium">
              {t("app.heroSubtitle")}
            </p>
            <h1 className="font-serif text-5xl sm:text-7xl font-bold leading-[1.05] tracking-[0.02em]">
              ＮＡＲＡＢＯＵ
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl">
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
