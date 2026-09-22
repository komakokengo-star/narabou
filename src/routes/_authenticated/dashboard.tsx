import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Header } from "@/components/Header";
import { useAuth, useRoles, useProfile } from "@/lib/auth";
import { selfGrantWorkerRole } from "@/lib/roles.functions";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ShoppingBag, Briefcase, ShieldCheck } from "lucide-react";
import { PushNotificationCard } from "@/components/PushNotificationCard";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "マイページ — ＮＡＲＡＢＯＵ" },
      { name: "description", content: "依頼・受注の状況確認、役割の切り替え、通知設定をまとめて管理できるNARABOUのマイページ。" },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "マイページ — ＮＡＲＡＢＯＵ" },
      { property: "og:description", content: "依頼・受注の状況確認、役割の切り替え、通知設定をまとめて管理できるNARABOUのマイページ。" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://app.narabou.jp/dashboard" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: roles = [], refetch: refetchRoles } = useRoles(user?.id);
  const { data: profile } = useProfile(user?.id);
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);

  const becomeWorker = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await selfGrantWorkerRole();
      toast.success("代行者ロールを追加しました");
      await refetchRoles();
      qc.invalidateQueries({ queryKey: ["roles", user.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "登録に失敗しました");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-10 max-w-5xl">
        <div className="mb-8">
          <h1 className="font-serif text-3xl">{t("nav.dashboard")}</h1>
          <h2 className="mt-1 text-base text-muted-foreground">こんにちは、{profile?.name || "..."}</h2>

          <div className="mt-2 flex gap-2">
            {roles.map((r) => (
              <Badge key={r} variant="secondary" className="capitalize">{t(`role.${r}`)}</Badge>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <RoleCard
            icon={<ShoppingBag className="w-5 h-5" />}
            title={t("role.customer")}
            desc="行列代行を依頼する"
            to="/customer"
            enabled={roles.includes("customer")}
          />
          <RoleCard
            icon={<Briefcase className="w-5 h-5" />}
            title={t("role.worker")}
            desc="依頼を受注して報酬を得る"
            to="/worker"
            enabled={roles.includes("worker")}
          />
          {roles.includes("admin") && (
            <RoleCard
              icon={<ShieldCheck className="w-5 h-5" />}
              title={t("role.admin")}
              desc="全体管理"
              to="/admin"
              enabled={true}
            />
          )}
        </div>

        {!roles.includes("worker") && (
          <Card className="mt-6 p-6 bg-accent/30">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="font-medium">{t("role.becomeWorker")}</div>
                <div className="text-xs text-muted-foreground mt-1">{t("role.becomeWorkerDesc")}</div>
              </div>
              <Button onClick={becomeWorker} disabled={loading}>
                {loading ? t("common.loading") : t("role.becomeWorker")}
              </Button>

            </div>
          </Card>
        )}

        <div className="mt-6">
          <PushNotificationCard />
        </div>
      </main>
    </div>
  );
}

function RoleCard({
  icon, title, desc, to, enabled,
}: { icon: React.ReactNode; title: string; desc: string; to: string; enabled: boolean }) {
  const body = (
    <Card className={`p-6 h-full transition ${enabled ? "hover:border-primary cursor-pointer" : "opacity-40"}`}>
      <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center mb-3">{icon}</div>
      <div className="font-medium">{title}</div>
      <div className="text-xs text-muted-foreground mt-1">{desc}</div>
      {!enabled && <div className="text-[10px] text-muted-foreground mt-3">未付与</div>}
    </Card>
  );
  return enabled ? <Link to={to}>{body}</Link> : body;
}
