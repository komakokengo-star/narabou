import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatYen } from "@/lib/fees";
import { toast } from "sonner";
import { cancelRequest } from "@/lib/payments.functions";
import {
  manualRefund,
  revertRequest,
  setRequestStatus,
  manualMarkPaid,
  manualMarkFailed,
} from "@/lib/troubles.functions";

export const Route = createFileRoute("/_authenticated/admin/troubles")({
  ssr: false,
  beforeLoad: async () => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw redirect({ to: "/auth" });
    const { data: ok } = await supabase.rpc("has_role", {
      _user_id: user.user.id,
      _role: "admin",
    });
    if (!ok) throw redirect({ to: "/dashboard" });
  },
  component: TroublesPage,
});

const STATUS_OPTIONS = [
  "open",
  "matched",
  "arrived",
  "in_progress",
  "completed",
  "canceled",
] as const;

type Filter = "all" | "trouble" | "canceled" | "pending_pay" | "failed_pay";

function TroublesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("trouble");

  const { data: requests = [] } = useQuery({
    queryKey: ["troubles-requests"],
    queryFn: async () => {
      const { data } = await supabase
        .from("requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
    refetchInterval: 8000,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["troubles-payments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      return data ?? [];
    },
    refetchInterval: 8000,
  });

  const paymentsByReq = useMemo(() => {
    const m = new Map<string, typeof payments>();
    for (const p of payments) {
      const arr = m.get(p.request_id) ?? [];
      arr.push(p);
      m.set(p.request_id, arr);
    }
    return m;
  }, [payments]);

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      const ps = paymentsByReq.get(r.id) ?? [];
      const hasFailed = ps.some((p) => p.status === "failed");
      const hasPending = ps.some((p) => p.status === "pending");
      const isCanceled = r.status === "canceled";
      const inProgressLong =
        ["matched", "arrived", "in_progress"].includes(r.status) &&
        Date.now() - new Date(r.created_at).getTime() > 1000 * 60 * 60 * 6; // 6h
      const trouble = hasFailed || isCanceled || inProgressLong || (hasPending && r.status !== "open");
      switch (filter) {
        case "all":
          return true;
        case "canceled":
          return isCanceled;
        case "pending_pay":
          return hasPending;
        case "failed_pay":
          return hasFailed;
        case "trouble":
        default:
          return trouble;
      }
    });
  }, [requests, paymentsByReq, filter]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["troubles-requests"] });
    qc.invalidateQueries({ queryKey: ["troubles-payments"] });
    qc.invalidateQueries({ queryKey: ["admin-requests"] });
    qc.invalidateQueries({ queryKey: ["admin-payments"] });
  };

  const forceCancel = useMutation({
    mutationFn: (id: string) => cancelRequest({ data: { requestId: id, force: true } }),
    onSuccess: (r) => {
      toast.success(`返金 ${formatYen(r.refunded)}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revert = useMutation({
    mutationFn: (id: string) => revertRequest({ data: { requestId: id } }),
    onSuccess: () => {
      toast.success(t("troubles.reverted"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changeStatus = useMutation({
    mutationFn: (v: { id: string; status: (typeof STATUS_OPTIONS)[number] }) =>
      setRequestStatus({ data: { requestId: v.id, status: v.status } }),
    onSuccess: () => {
      toast.success(t("troubles.statusChanged"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markPaid = useMutation({
    mutationFn: (id: string) => manualMarkPaid({ data: { paymentId: id } }),
    onSuccess: () => {
      toast.success(t("troubles.markedPaid"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markFailed = useMutation({
    mutationFn: (id: string) => manualMarkFailed({ data: { paymentId: id } }),
    onSuccess: () => {
      toast.success(t("troubles.markedFailed"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-10 max-w-6xl">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="font-serif text-3xl">{t("troubles.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("troubles.subtitle")}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/admin">← {t("admin.title")}</Link>
          </Button>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          {(["trouble", "canceled", "pending_pay", "failed_pay", "all"] as Filter[]).map(
            (f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "default" : "outline"}
                onClick={() => setFilter(f)}
              >
                {t(`troubles.filter.${f}`)}
              </Button>
            ),
          )}
          <div className="ml-auto text-sm text-muted-foreground self-center">
            {filtered.length} 件
          </div>
        </div>

        <div className="space-y-4">
          {filtered.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">
              {t("common.noData")}
            </Card>
          )}
          {filtered.map((r) => (
            <TroubleCard
              key={r.id}
              request={r}
              payments={paymentsByReq.get(r.id) ?? []}
              onForceCancel={() => forceCancel.mutate(r.id)}
              onRevert={() => {
                if (confirm(t("troubles.revertConfirm"))) revert.mutate(r.id);
              }}
              onChangeStatus={(s) => changeStatus.mutate({ id: r.id, status: s })}
              onMarkPaid={(pid) => markPaid.mutate(pid)}
              onMarkFailed={(pid) => markFailed.mutate(pid)}
              onAfterRefund={invalidate}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function TroubleCard({
  request: r,
  payments,
  onForceCancel,
  onRevert,
  onChangeStatus,
  onMarkPaid,
  onMarkFailed,
  onAfterRefund,
}: {
  request: any;
  payments: any[];
  onForceCancel: () => void;
  onRevert: () => void;
  onChangeStatus: (s: (typeof STATUS_OPTIONS)[number]) => void;
  onMarkPaid: (pid: string) => void;
  onMarkFailed: (pid: string) => void;
  onAfterRefund: () => void;
}) {
  const { t } = useTranslation();
  const totalPaid = payments
    .filter((p) => p.status === "paid" || p.status === "partially_refunded")
    .reduce((s, p) => s + p.amount - (p.refund_amount ?? 0), 0);

  return (
    <Card className="p-5">
      <div className="flex justify-between items-start flex-wrap gap-3 mb-3">
        <div>
          <div className="font-medium">{r.store_name}</div>
          <div className="text-xs text-muted-foreground">
            {new Date(r.created_at).toLocaleString()} · {r.id.slice(0, 8)}
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Badge variant="secondary">{t(`request.status.${r.status}`)}</Badge>
          <Badge variant="outline">{formatYen(r.total_fee)}</Badge>
          {totalPaid > 0 && (
            <Badge>
              {t("troubles.netPaid")}: {formatYen(totalPaid)}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-medium mb-2 text-muted-foreground">
            {t("troubles.statusActions")}
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <Select
              value={r.status}
              onValueChange={(v) => onChangeStatus(v as (typeof STATUS_OPTIONS)[number])}
            >
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`request.status.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={onRevert}>
              {t("troubles.revert")}
            </Button>
            {r.status !== "canceled" && r.status !== "completed" && (
              <Button size="sm" variant="destructive" onClick={onForceCancel}>
                {t("admin.forceCancel")}
              </Button>
            )}
          </div>
        </div>

        <div>
          <div className="text-xs font-medium mb-2 text-muted-foreground">
            {t("troubles.payments")} ({payments.length})
          </div>
          <div className="space-y-2">
            {payments.length === 0 && (
              <div className="text-xs text-muted-foreground">
                {t("common.noData")}
              </div>
            )}
            {payments.map((p) => (
              <PaymentRow
                key={p.id}
                p={p}
                onMarkPaid={() => onMarkPaid(p.id)}
                onMarkFailed={() => onMarkFailed(p.id)}
                onAfterRefund={onAfterRefund}
              />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function PaymentRow({
  p,
  onMarkPaid,
  onMarkFailed,
  onAfterRefund,
}: {
  p: any;
  onMarkPaid: () => void;
  onMarkFailed: () => void;
  onAfterRefund: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const remaining = p.amount - (p.refund_amount ?? 0);
  const [amount, setAmount] = useState(remaining);
  const [reason, setReason] = useState("");

  const refund = useMutation({
    mutationFn: () =>
      manualRefund({
        data: { paymentId: p.id, amount: Number(amount), reason },
      }),
    onSuccess: (r) => {
      toast.success(`返金 ${formatYen(r.refunded)}`);
      setOpen(false);
      setReason("");
      onAfterRefund();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="border border-border rounded-md p-2 text-xs">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <div>
          <span className="font-medium">{p.kind}</span> ·{" "}
          {formatYen(p.amount)}
          {p.refund_amount > 0 && (
            <span className="text-muted-foreground">
              {" "}
              (返金 {formatYen(p.refund_amount)})
            </span>
          )}
        </div>
        <div className="flex gap-1 items-center flex-wrap">
          <Badge variant="secondary">
            {t(`payment.${p.status === "partially_refunded" ? "partial" : p.status}`)}
          </Badge>
          {p.status === "pending" && (
            <>
              <Button size="sm" variant="outline" className="h-6 text-xs" onClick={onMarkPaid}>
                {t("troubles.markPaid")}
              </Button>
              <Button size="sm" variant="outline" className="h-6 text-xs" onClick={onMarkFailed}>
                {t("troubles.markFailed")}
              </Button>
            </>
          )}
          {(p.status === "paid" || p.status === "partially_refunded") && remaining > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs"
              onClick={() => setOpen((v) => !v)}
            >
              {t("troubles.partialRefund")}
            </Button>
          )}
        </div>
      </div>
      {open && (
        <div className="mt-2 p-2 bg-muted/40 rounded space-y-2">
          <div className="flex items-center gap-2">
            <span>{t("troubles.refundAmount")}:</span>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="h-7 w-28 text-xs"
              min={1}
              max={remaining}
            />
            <span className="text-muted-foreground">
              / {formatYen(remaining)}
            </span>
          </div>
          <Textarea
            placeholder={t("troubles.reason")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="text-xs"
            rows={2}
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => refund.mutate()}
              disabled={refund.isPending || amount < 1 || amount > remaining}
            >
              {t("troubles.executeRefund")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
