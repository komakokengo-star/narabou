import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { formatYen, calcFee, PLATFORM_RATE } from "@/lib/fees";
import { toast } from "sonner";
import { CheckCircle2, User, Landmark, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { createConnectAccount, refreshConnectStatus } from "@/lib/stripe-connect.functions";
import { StripeEmbeddedOnboarding } from "@/components/StripeEmbeddedOnboarding";

export const Route = createFileRoute("/_authenticated/worker/")({
  component: WorkerHome,
});

function WorkerHome() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: profile, refetch: refetchProfile } = useProfile(user?.id);
  const qc = useQueryClient();
  const [onboardingOpen, setOnboardingOpen] = useState(false);


  const [displayName, setDisplayName] = useState("");
  useEffect(() => { if (profile?.name) setDisplayName(profile.name); }, [profile?.name]);

  const { data: openJobs = [] } = useQuery({
    queryKey: ["open-jobs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("requests").select("*").eq("status", "open")
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
        .eq("worker_id", user!.id).order("created_at", { ascending: false });
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

  const saveName = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles").update({ name: displayName }).eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("worker.account.saved")); refetchProfile(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const startPayoutOnboarding = useMutation({
    mutationFn: async () => {
      const created = await createConnectAccount();
      if (created.error) throw new Error(created.error);
      return true;
    },
    onSuccess: () => setOnboardingOpen(true),
    onError: (e: Error) => toast.error(e.message),
  });

  const refreshPayout = useMutation({
    mutationFn: () => refreshConnectStatus(),
    onSuccess: (r) => {
      if (r.error) { toast.error(r.error); return; }
      refetchProfile();
      toast.success(t("worker.account.saved"));
    },
  });


  const payoutReady = !!profile?.stripe_account_ready;
  const payoutPending = !!profile?.stripe_account_id && !payoutReady;

  // Stripeから戻ってきたときに即時ステータス更新
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("payout") === "ready" || params.get("payout") === "refresh") {
      refreshConnectStatus().then((r) => {
        if (!r.error) refetchProfile();
      });
      params.delete("payout");
      const q = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (q ? `?${q}` : ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 審査中は自動ポーリング（webhookが遅延した場合の保険）
  useEffect(() => {
    if (!payoutPending) return;
    let cancelled = false;
    const tick = async () => {
      const r = await refreshConnectStatus();
      if (cancelled) return;
      if (!r.error) {
        await refetchProfile();
        if (r.ready) toast.success(t("worker.account.ready"));
      }
    };
    const id = setInterval(tick, 8000);
    return () => { cancelled = true; clearInterval(id); };
  }, [payoutPending, refetchProfile, t]);
  const canAcceptJobs = payoutReady;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-10 max-w-5xl">
        <h1 className="font-serif text-3xl mb-6">{t("role.worker")}</h1>

        {/* Onboarding */}
        <Card className="p-6 mb-8">
          <div className="mb-5">
            <h2 className="font-medium text-lg">{t("worker.account.title")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("worker.account.subtitle")}</p>
          </div>

          {/* Step 1 */}
          <div className="border rounded-lg p-4 mb-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <User className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="font-medium">1. {t("worker.account.step1")}</div>
                  {profile?.name && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                </div>
                <p className="text-xs text-muted-foreground mt-1 mb-3">{t("worker.account.step1Desc")}</p>
                <div className="flex gap-2 flex-wrap items-end">
                  <div className="flex-1 min-w-[200px]">
                    <Label htmlFor="displayName" className="text-xs">{t("worker.account.displayName")}</Label>
                    <Input
                      id="displayName"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="山田 太郎"
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => saveName.mutate()}
                    disabled={saveName.isPending || !displayName.trim() || displayName === profile?.name}
                  >
                    {t("worker.account.save")}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="border rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Landmark className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-medium">2. {t("worker.account.step2")}</div>
                  {payoutReady && (
                    <Badge className="bg-emerald-600 hover:bg-emerald-600">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      {t("worker.account.ready")}
                    </Badge>
                  )}
                  {payoutPending && <Badge variant="secondary">{t("worker.account.pending")}</Badge>}
                  {!payoutReady && !payoutPending && <Badge variant="outline">{t("worker.account.notReady")}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1 mb-3">{t("worker.account.step2Desc")}</p>

                {!payoutReady && (
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      onClick={() => {
                        if (profile?.stripe_account_id) {
                          setOnboardingOpen(true);
                        } else {
                          startPayoutOnboarding.mutate();
                        }
                      }}
                      disabled={startPayoutOnboarding.isPending}
                    >
                      {payoutPending ? t("worker.account.continue") : t("worker.account.register")}
                    </Button>
                    {payoutPending && (
                      <Button variant="outline" onClick={() => refreshPayout.mutate()} disabled={refreshPayout.isPending}>
                        {t("worker.account.refresh")}
                      </Button>
                    )}
                  </div>
                )}


                <div className="flex items-center gap-1.5 mt-3 text-[11px] text-muted-foreground">
                  <Lock className="w-3 h-3" />
                  {t("worker.account.help")}
                </div>
              </div>
            </div>
          </div>
        </Card>

        <h2 className="font-medium mb-3">{t("worker.openJobs")}</h2>
        {!canAcceptJobs && (
          <div className="text-xs text-muted-foreground mb-3">
            ※ 受注するには「受取口座の登録」を完了してください。
          </div>
        )}
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
                <Button size="sm" onClick={() => accept.mutate(r.id)} disabled={!canAcceptJobs}>
                  {t("request.actions.accept")}
                </Button>
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

      <Dialog
        open={onboardingOpen}
        onOpenChange={(o) => {
          setOnboardingOpen(o);
          if (!o) {
            refreshConnectStatus().then((r) => {
              if (!r.error) refetchProfile();
            });
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>受取口座の登録</DialogTitle>
            <DialogDescription>
              Stripe（決済パートナー）の安全なフォームで、本人確認と受取口座情報を入力してください。
            </DialogDescription>
          </DialogHeader>
          {onboardingOpen && (
            <StripeEmbeddedOnboarding
              onExit={() => {
                setOnboardingOpen(false);
                refreshConnectStatus().then((r) => {
                  if (!r.error) refetchProfile();
                });
              }}
              onError={(msg) => toast.error(msg)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );

}
