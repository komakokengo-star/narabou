import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatYen, PLATFORM_RATE } from "@/lib/fees";
import { toast } from "sonner";
import { cancelRequest } from "@/lib/payments.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  ssr: false,
  beforeLoad: async () => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw redirect({ to: "/auth" });
    const { data: ok } = await supabase.rpc("has_role", { _user_id: user.user.id, _role: "admin" });
    if (!ok) throw redirect({ to: "/dashboard" });
  },
  component: AdminHome,
});

function AdminHome() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: requests = [] } = useQuery({
    queryKey: ["admin-requests"],
    queryFn: async () => {
      const { data } = await supabase.from("requests").select("*").order("created_at", { ascending: false }).limit(100);
      return data ?? [];
    },
    refetchInterval: 10000,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["admin-payments"],
    queryFn: async () => {
      const { data } = await supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(200);
      return data ?? [];
    },
    refetchInterval: 10000,
  });

  const { data: workers = [] } = useQuery({
    queryKey: ["admin-workers"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "worker");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [];
      const { data: profs } = await supabase.from("profiles").select("*").in("id", ids);
      return profs ?? [];
    },
  });

  const togglePeak = useMutation({
    mutationFn: async (r: { id: string; is_peak: boolean }) => {
      await supabase.from("requests").update({ is_peak: !r.is_peak }).eq("id", r.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-requests"] }),
  });

  const forceCancel = useMutation({
    mutationFn: (id: string) => cancelRequest({ data: { requestId: id, force: true } }),
    onSuccess: (r) => { toast.success(`返金 ${formatYen(r.refunded)}`); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const verify = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("profiles").update({ verified: true }).eq("id", id);
    },
    onSuccess: () => { toast.success("承認しました"); qc.invalidateQueries({ queryKey: ["admin-workers"] }); },
  });

  const totalRevenue = payments.filter(p => p.status === "paid" || p.status === "partially_refunded")
    .reduce((s, p) => s + p.amount - p.refund_amount, 0);
  const platformRevenue = Math.round(totalRevenue * PLATFORM_RATE);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-10 max-w-6xl">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h1 className="font-serif text-3xl">{t("admin.title")}</h1>
          <Button asChild variant="outline">
            <Link to="/admin/troubles">{t("admin.troubles")} →</Link>
          </Button>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          <Card className="p-6">
            <div className="text-xs text-muted-foreground">{t("admin.totalRevenue")}</div>
            <div className="font-serif text-2xl mt-1">{formatYen(totalRevenue)}</div>
          </Card>
          <Card className="p-6">
            <div className="text-xs text-muted-foreground">{t("admin.platformRevenue")}</div>
            <div className="font-serif text-2xl mt-1 text-primary">{formatYen(platformRevenue)}</div>
          </Card>
          <Card className="p-6">
            <div className="text-xs text-muted-foreground">依頼総数</div>
            <div className="font-serif text-2xl mt-1">{requests.length}</div>
          </Card>
        </div>

        <h2 className="font-medium mb-3">{t("admin.requests")}</h2>
        <div className="space-y-2 mb-8">
          {requests.map((r) => (
            <Card key={r.id} className="p-3 flex flex-wrap items-center gap-3 justify-between">
              <div className="text-sm">
                <div className="font-medium">{r.store_name}</div>
                <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()} · {formatYen(r.total_fee)}</div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">{t(`request.status.${r.status}`)}</Badge>
                {r.is_peak && <Badge>PEAK</Badge>}
                <Button size="sm" variant="outline" onClick={() => togglePeak.mutate(r)}>{t("admin.togglePeak")}</Button>
                {r.status !== "canceled" && r.status !== "completed" && (
                  <Button size="sm" variant="destructive" onClick={() => forceCancel.mutate(r.id)}>{t("admin.forceCancel")}</Button>
                )}
              </div>
            </Card>
          ))}
        </div>

        <h2 className="font-medium mb-3">{t("admin.workers")}</h2>
        <div className="grid sm:grid-cols-2 gap-3 mb-8">
          {workers.map((w) => (
            <Card key={w.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">{w.name}</div>
                <div className="text-xs text-muted-foreground">
                  ★{w.rating ?? "-"} ({w.rating_count ?? 0}) · Stripe {w.stripe_account_ready ? "✓" : "—"}
                </div>
              </div>
              {!w.verified ? (
                <Button size="sm" onClick={() => verify.mutate(w.id)}>{t("admin.approveVerification")}</Button>
              ) : (
                <Badge>{t("worker.verification.verified")}</Badge>
              )}
            </Card>
          ))}
        </div>

        <h2 className="font-medium mb-3">{t("admin.payments")}</h2>
        <div className="space-y-1 text-sm">
          {payments.map((p) => (
            <div key={p.id} className="flex justify-between border-b border-border py-2">
              <span className="text-xs">{new Date(p.created_at).toLocaleString()} · {p.kind}</span>
              <span>{formatYen(p.amount)} · {t(`payment.${p.status === "partially_refunded" ? "partial" : p.status}`)}</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
