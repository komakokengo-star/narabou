import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatYen, calcFee, PLATFORM_RATE } from "@/lib/fees";
import { toast } from "sonner";
import {
  createConnectAccount, createAccountLink, refreshConnectStatus,
} from "@/lib/stripe-connect.functions";

export const Route = createFileRoute("/_authenticated/worker/")({
  component: WorkerHome,
});

function WorkerHome() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: profile, refetch: refetchProfile } = useProfile(user?.id);
  const qc = useQueryClient();

  const { data: openJobs = [] } = useQuery({
    queryKey: ["open-jobs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("requests")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    refetchInterval: 10000,
  });

  const { data: myJobs = [] } = useQuery({
    queryKey: ["my-jobs", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: matches } = await supabase
        .from("matches").select("*, requests(*)")
        .eq("worker_id", user!.id)
        .order("created_at", { ascending: false });
      return matches ?? [];
    },
    refetchInterval: 10000,
  });

  const accept = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.from("matches").insert({ request_id: requestId, worker_id: user!.id });
      if (error) throw error;
      await supabase.from("requests").update({ status: "matched" }).eq("id", requestId);
    },
    onSuccess: () => { toast.success("受注しました"); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const stripeCreate = useMutation({
    mutationFn: async () => {
      await createConnectAccount();
      const { url } = await createAccountLink({
        data: {
          returnUrl: `${window.location.origin}/worker?stripe=ready`,
          refreshUrl: `${window.location.origin}/worker?stripe=refresh`,
        },
      });
      window.location.href = url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stripeRefresh = useMutation({
    mutationFn: () => refreshConnectStatus(),
    onSuccess: () => { refetchProfile(); toast.success("更新しました"); },
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-10 max-w-5xl">
        <h1 className="font-serif text-3xl mb-6">{t("role.worker")}</h1>

        <Card className="p-6 mb-8">
          <h2 className="font-medium mb-2">{t("worker.stripe.title")}</h2>
          {profile?.stripe_account_ready ? (
            <Badge>{t("worker.stripe.ready")}</Badge>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-3">{t("worker.stripe.notReady")}</p>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => stripeCreate.mutate()} disabled={stripeCreate.isPending}>
                  {profile?.stripe_account_id ? t("worker.stripe.onboard") : t("worker.stripe.create")}
                </Button>
                {profile?.stripe_account_id && (
                  <Button variant="outline" onClick={() => stripeRefresh.mutate()} disabled={stripeRefresh.isPending}>
                    {t("common.refresh")}
                  </Button>
                )}
              </div>
            </>
          )}
        </Card>

        <h2 className="font-medium mb-3">{t("worker.openJobs")}</h2>
        <div className="grid gap-3 mb-8">
          {openJobs.length === 0 && <div className="text-sm text-muted-foreground">{t("common.noData")}</div>}
          {openJobs.map((r) => {
            const f = calcFee({ waitMinutes: r.estimated_wait_minutes ?? 30, isPeak: r.is_peak });
            return (
              <Card key={r.id} className="p-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="font-medium">{r.store_name}</div>
                  <div className="text-xs text-muted-foreground">
                    想定 {r.estimated_wait_minutes}分 · {r.is_peak ? "ピーク" : "通常"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm">{formatYen(f.total)}</div>
                  <div className="text-[10px] text-muted-foreground">報酬 {formatYen(Math.round(f.total * (1 - PLATFORM_RATE)))}</div>
                </div>
                <Button size="sm" onClick={() => accept.mutate(r.id)}>{t("request.actions.accept")}</Button>
              </Card>
            );
          })}
        </div>

        <h2 className="font-medium mb-3">{t("worker.myJobs")}</h2>
        <div className="grid gap-3">
          {myJobs.length === 0 && <div className="text-sm text-muted-foreground">{t("common.noData")}</div>}
          {myJobs.map((m) => {
            const r = m.requests as { id: string; store_name: string; status: string; total_fee: number } | null;
            if (!r) return null;
            return (
              <Link key={m.id} to="/worker/job/$id" params={{ id: m.id }}>
                <Card className="p-4 hover:border-primary transition flex items-center justify-between">
                  <div>
                    <div className="font-medium">{r.store_name}</div>
                    <div className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <Badge variant="secondary">{t(`request.status.${r.status}`)}</Badge>
                    <div className="text-sm mt-1">報酬 {formatYen(Math.round(r.total_fee * (1 - PLATFORM_RATE)))}</div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
