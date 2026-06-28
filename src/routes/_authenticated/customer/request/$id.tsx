import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { FuzzyMap } from "@/components/FuzzyMap";
import { StripePaymentForm } from "@/components/StripePaymentForm";
import { createPaymentIntent, chargeExtension, cancelRequest } from "@/lib/payments.functions";
import { calcCancelRefund, formatYen } from "@/lib/fees";
import { toast } from "sonner";
import { ArrowLeft, Clock, Camera } from "lucide-react";

export const Route = createFileRoute("/_authenticated/customer/request/$id")({
  component: RequestDetail,
});

function RequestDetail() {
  const { id } = Route.useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: request, refetch } = useQuery({
    queryKey: ["request", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("requests").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 8000,
  });

  const { data: match } = useQuery({
    queryKey: ["match", id],
    queryFn: async () => {
      const { data } = await supabase.from("matches").select("*").eq("request_id", id).maybeSingle();
      return data;
    },
    refetchInterval: 8000,
  });

  const { data: checkins = [] } = useQuery({
    queryKey: ["checkins", match?.id],
    enabled: !!match?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("checkins").select("*").eq("match_id", match!.id).order("timestamp", { ascending: false });
      return data ?? [];
    },
    refetchInterval: 10000,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["payments", id],
    queryFn: async () => {
      const { data } = await supabase.from("payments").select("*").eq("request_id", id);
      return data ?? [];
    },
    refetchInterval: 8000,
  });

  const [intent, setIntent] = useState<{ clientSecret: string; amount: number } | null>(null);
  const startPay = useMutation({
    mutationFn: () => createPaymentIntent({ data: { requestId: id } }),
    onSuccess: (r) => setIntent({ clientSecret: r.clientSecret!, amount: r.amount }),
    onError: (e: Error) => toast.error(e.message),
  });

  const [extMin, setExtMin] = useState(10);
  const extend = useMutation({
    mutationFn: () => chargeExtension({ data: { requestId: id, extraMinutes: extMin } }),
    onSuccess: (r) => {
      setIntent({ clientSecret: r.clientSecret!, amount: r.amount });
      toast.success("延長分の支払いに進んでください");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: () => cancelRequest({ data: { requestId: id } }),
    onSuccess: (r) => { toast.success(`返金額: ${formatYen(r.refunded)}`); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!request) return <div className="p-10 text-center">{t("common.loading")}</div>;

  const latest = checkins[0];
  const totalPaid = payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const refundEstimate = calcCancelRefund({
    arrived: !!match?.arrival_time,
    startedAt: match?.start_time ? new Date(match.start_time) : null,
    canceledAt: new Date(),
    isPeak: request.is_peak,
    extraFee: request.extra_fee ?? 0,
    totalPaid,
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
        <Link to="/customer" className="text-sm text-muted-foreground inline-flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> {t("common.back")}
        </Link>
        <Card className="p-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="font-serif text-2xl">{request.store_name}</h1>
              <div className="text-xs text-muted-foreground mt-1">
                {request.store_address ?? ""}
              </div>
            </div>
            <Badge variant="secondary">{t(`request.status.${request.status}`)}</Badge>
          </div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Stat label={t("fees.total")} v={formatYen(request.total_fee)} />
            <Stat label={t("fees.base")} v={formatYen(request.base_fee)} />
            <Stat label={t("fees.time")} v={formatYen(request.time_fee)} />
            <Stat label={t("fees.extra")} v={formatYen(request.extra_fee)} />
          </div>
        </Card>

        {/* Map */}
        {latest?.location_lat && latest?.location_lng && (
          <Card className="p-6 mt-6">
            <div className="text-sm font-medium mb-2">代行者の位置</div>
            <FuzzyMap lat={Number(latest.location_lat)} lng={Number(latest.location_lng)} fuzzSeed={match?.id ?? id} />
            <p className="text-[10px] text-muted-foreground mt-2">{t("map.approx")}</p>
            {latest.wait_time != null && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-primary" />
                現在の待ち時間: {latest.wait_time}{t("common.minutes")}
              </div>
            )}
          </Card>
        )}

        {/* Checkins */}
        {checkins.length > 0 && (
          <Card className="p-6 mt-6">
            <div className="text-sm font-medium mb-3">定点報告 ({checkins.length})</div>
            <div className="space-y-3">
              {checkins.map((c) => (
                <div key={c.id} className="flex gap-3 border-b border-border pb-3 last:border-0">
                  {c.photo_url && (
                    <a href={c.photo_url} target="_blank" rel="noreferrer">
                      <img src={c.photo_url} alt="" className="w-20 h-20 object-cover rounded" />
                    </a>
                  )}
                  <div className="text-xs space-y-1">
                    <div>{new Date(c.timestamp).toLocaleString()}</div>
                    {c.wait_time != null && <div>待ち時間: {c.wait_time}分</div>}
                    {c.note && <div className="text-muted-foreground">{c.note}</div>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Actions */}
        <Card className="p-6 mt-6 space-y-3">
          {!payments.some((p) => p.status === "paid" && p.kind === "main") && (
            <Button className="w-full" onClick={() => startPay.mutate()} disabled={startPay.isPending}>
              {t("request.actions.pay")}
            </Button>
          )}

          {request.status !== "completed" && request.status !== "canceled" && (
            <>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full">{t("request.actions.extend")}</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t("request.extensionPrompt")}</DialogTitle></DialogHeader>
                  <div className="space-y-2">
                    <Label>{t("common.minutes")}</Label>
                    <Input type="number" min={10} step={10} value={extMin} onChange={(e) => setExtMin(Number(e.target.value))} />
                    <p className="text-xs text-muted-foreground">
                      追加料金: {formatYen(Math.ceil(extMin / 10) * 200)}
                    </p>
                  </div>
                  <DialogFooter>
                    <Button onClick={() => extend.mutate()} disabled={extend.isPending}>
                      {t("request.actions.approveExtension")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="destructive" className="w-full">{t("request.actions.cancel")}</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t("request.actions.cancel")}</DialogTitle></DialogHeader>
                  <p className="text-sm">
                    {t("request.cancelConfirm", { amount: refundEstimate.refund.toLocaleString() })}
                  </p>
                  <DialogFooter>
                    <Button variant="destructive" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                      {t("request.actions.cancel")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </Card>

        {/* Payment */}
        {intent && (
          <Card className="p-6 mt-6">
            <h3 className="font-medium mb-3">{t("payment.title")}</h3>
            <StripePaymentForm
              clientSecret={intent.clientSecret}
              amount={intent.amount}
              onSuccess={() => { setIntent(null); refetch(); qc.invalidateQueries(); }}
            />
          </Card>
        )}

        {/* Payments history */}
        <Card className="p-6 mt-6">
          <h3 className="font-medium mb-3 flex items-center gap-2"><Camera className="w-4 h-4" />{t("payment.history")}</h3>
          {payments.length === 0 ? <div className="text-xs text-muted-foreground">{t("common.noData")}</div> :
            <div className="space-y-2 text-sm">
              {payments.map((p) => (
                <div key={p.id} className="flex justify-between border-b border-border pb-2 last:border-0">
                  <span>{p.kind} · {t(`payment.${p.status === "partially_refunded" ? "partial" : p.status}`)}</span>
                  <span>{formatYen(p.amount)}{p.refund_amount > 0 && <span className="text-xs text-muted-foreground ml-1">(返金 {formatYen(p.refund_amount)})</span>}</span>
                </div>
              ))}
            </div>
          }
        </Card>
      </main>
    </div>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div className="p-3 rounded-md bg-muted/40">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-medium">{v}</div>
    </div>
  );
}
