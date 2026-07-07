import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect } from "react";
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
import { adminListConnectStatuses, type ConnectStatus } from "@/lib/stripe-connect.functions";
import { CheckCircle2, Clock, AlertTriangle, Circle, RefreshCw, Bell, BellRing } from "lucide-react";

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

  type Notification = {
    id: string; kind: string; severity: string; title: string; body: string | null;
    request_id: string | null; details: Record<string, unknown>; read_at: string | null; created_at: string;
  };
  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["admin-notifications"],
    queryFn: async () => {
      const { data } = await supabase.from("admin_notifications" as never)
        .select("*").order("created_at", { ascending: false }).limit(50);
      return (data ?? []) as unknown as Notification[];
    },
    refetchInterval: 15000,
  });

  // Realtime購読
  useEffect(() => {
    const channel = supabase.channel("admin-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_notifications" },
        (payload) => {
          const n = payload.new as Notification;
          if (n.severity === "alert") toast.error(`🚨 ${n.title}`, { description: n.body ?? undefined });
          else if (n.severity === "warn") toast.warning(n.title, { description: n.body ?? undefined });
          else toast.info(n.title, { description: n.body ?? undefined });
          qc.invalidateQueries({ queryKey: ["admin-notifications"] });
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "requests" },
        () => qc.invalidateQueries({ queryKey: ["admin-requests"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" },
        () => qc.invalidateQueries({ queryKey: ["admin-payments"] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("admin_notifications" as never)
        .update({ read_at: new Date().toISOString() } as never).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-notifications"] }),
  });
  const markAllRead = useMutation({
    mutationFn: async () => {
      await supabase.from("admin_notifications" as never)
        .update({ read_at: new Date().toISOString() } as never).is("read_at", null);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-notifications"] }),
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

  const { data: connectData, isFetching: connectFetching, refetch: refetchConnect } = useQuery({
    queryKey: ["admin-connect-statuses"],
    queryFn: () => adminListConnectStatuses(),
    refetchInterval: 30000,
  });
  const connectRows = connectData?.rows ?? [];
  const connectByUser = new Map(connectRows.map((r) => [r.userId, r]));
  const connectCounts = connectRows.reduce(
    (acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; },
    {} as Record<ConnectStatus, number>,
  );

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
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/admin/troubles">{t("admin.troubles")} →</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/audit">{t("audit.title")} →</Link>
            </Button>
          </div>
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

        {/* リアルタイム通知フィード */}
        <Card className="p-4 mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 font-medium">
              {notifications.some(n => !n.read_at)
                ? <BellRing className="w-4 h-4 text-primary animate-pulse" />
                : <Bell className="w-4 h-4 text-muted-foreground" />}
              リアルタイム通知
              {notifications.filter(n => !n.read_at).length > 0 && (
                <Badge>{notifications.filter(n => !n.read_at).length} 未読</Badge>
              )}
            </div>
            {notifications.some(n => !n.read_at) && (
              <Button size="sm" variant="ghost" onClick={() => markAllRead.mutate()}>
                すべて既読
              </Button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto space-y-1">
            {notifications.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-6">通知はありません</div>
            )}
            {notifications.map(n => (
              <div
                key={n.id}
                className={`p-2 rounded-md text-sm flex items-start gap-2 border ${
                  !n.read_at ? "bg-primary/5 border-primary/20" : "border-transparent"
                }`}
              >
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                  n.severity === "alert" ? "bg-destructive" :
                  n.severity === "warn" ? "bg-amber-500" : "bg-emerald-500"
                }`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{n.title}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                  </div>
                  {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
                </div>
                {!n.read_at && (
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                    onClick={() => markRead.mutate(n.id)}>既読</Button>
                )}
              </div>
            ))}
          </div>
        </Card>


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
                {r.is_peak && <Badge>ピーク</Badge>}
                <Button size="sm" variant="outline" onClick={() => togglePeak.mutate(r)}>{t("admin.togglePeak")}</Button>
                {r.status !== "canceled" && r.status !== "completed" && (
                  <Button size="sm" variant="destructive" onClick={() => forceCancel.mutate(r.id)}>{t("admin.forceCancel")}</Button>
                )}
              </div>
            </Card>
          ))}
        </div>

        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-medium">{t("admin.workers")}</h2>
          <Button size="sm" variant="outline" onClick={() => refetchConnect()} disabled={connectFetching}>
            <RefreshCw className={`w-3 h-3 mr-1 ${connectFetching ? "animate-spin" : ""}`} />
            受取口座を再同期
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <Card className="p-3">
            <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Circle className="w-3 h-3" />未開始</div>
            <div className="font-serif text-xl mt-1">{connectCounts.not_started ?? 0}</div>
          </Card>
          <Card className="p-3">
            <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3 text-amber-600" />進行中</div>
            <div className="font-serif text-xl mt-1">{connectCounts.in_progress ?? 0}</div>
          </Card>
          <Card className="p-3">
            <div className="text-[11px] text-muted-foreground flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-600" />完了</div>
            <div className="font-serif text-xl mt-1">{connectCounts.completed ?? 0}</div>
          </Card>
          <Card className="p-3">
            <div className="text-[11px] text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-destructive" />エラー</div>
            <div className="font-serif text-xl mt-1">{connectCounts.error ?? 0}</div>
          </Card>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mb-8">
          {workers.map((w) => {
            const c = connectByUser.get(w.id);
            const status: ConnectStatus = c?.status ?? (w.stripe_account_ready ? "completed" : w.stripe_account_id ? "in_progress" : "not_started");
            const badge =
              status === "completed" ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="w-3 h-3 mr-1" />完了</Badge>
              ) : status === "in_progress" ? (
                <Badge className="bg-amber-500 hover:bg-amber-500"><Clock className="w-3 h-3 mr-1" />進行中</Badge>
              ) : status === "error" ? (
                <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />エラー</Badge>
              ) : (
                <Badge variant="outline"><Circle className="w-3 h-3 mr-1" />未開始</Badge>
              );
            return (
              <Card key={w.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{w.name}</div>
                    <div className="text-xs text-muted-foreground">
                      ★{w.rating ?? "-"} ({w.rating_count ?? 0})
                    </div>
                  </div>
                  {!w.verified ? (
                    <Button size="sm" onClick={() => verify.mutate(w.id)}>{t("admin.approveVerification")}</Button>
                  ) : (
                    <Badge variant="secondary">{t("worker.verification.verified")}</Badge>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-[11px] text-muted-foreground">受取口座</div>
                  {badge}
                </div>
                {c && (c.status === "error" || c.status === "in_progress") && (
                  <div className="mt-2 text-[11px] text-muted-foreground space-y-0.5">
                    {c.disabledReason && <div>理由: {c.disabledReason}</div>}
                    {c.errorMessage && <div>詳細: {c.errorMessage}</div>}
                    {c.currentlyDue.length > 0 && (
                      <div>要提出: {c.currentlyDue.slice(0, 3).join(", ")}{c.currentlyDue.length > 3 ? "…" : ""}</div>
                    )}
                  </div>
                )}
                {c?.accountId && (
                  <div className="mt-1 text-[10px] text-muted-foreground font-mono truncate">{c.accountId}</div>
                )}
              </Card>
            );
          })}
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
