import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";

import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PEAK_FEE } from "@/lib/fees";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { FuzzyMap } from "@/components/FuzzyMap";
import { StripePaymentForm } from "@/components/StripePaymentForm";
import { createPaymentIntent, chargeExtension, cancelRequest, respondToMatch, confirmCompletion, disputeCompletion } from "@/lib/payments.functions";
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

  const [approvalComment, setApprovalComment] = useState("");
  const respondMatch = useMutation({
    mutationFn: (v: { approve: boolean; autoCancel?: boolean }) =>
      respondToMatch({ data: { matchId: match!.id, approve: v.approve, comment: approvalComment, autoCancel: v.autoCancel } }),
    onSuccess: (_r, v) => {
      toast.success(v.approve ? "承認しました。決済のオーソリへ進んでください" : (v.autoCancel ? "5分以内に承認されなかったため自動キャンセルしました" : "受注申請を拒否しました"));
      qc.invalidateQueries();
      if (v.approve) startPay.mutate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [disputeReason, setDisputeReason] = useState("");
  const [showDispute, setShowDispute] = useState(false);
  const confirmDone = useMutation({
    mutationFn: () => confirmCompletion({ data: { requestId: id } }),
    onSuccess: () => { toast.success("受け取りを確認しました。決済を確定しました"); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const disputeDone = useMutation({
    mutationFn: () => disputeCompletion({ data: { requestId: id, reason: disputeReason } }),
    onSuccess: () => { toast.success("異議を申し立てました。管理者が対応します"); setShowDispute(false); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // 5分タイムアウトで自動キャンセル
  const matchStatus = (match as unknown as { status?: string } | null)?.status;
  const matchCreatedAt = (match as unknown as { created_at?: string } | null)?.created_at;
  const deadlineMs = matchCreatedAt ? new Date(matchCreatedAt).getTime() + 5 * 60 * 1000 : null;
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    if (matchStatus !== "pending_approval") return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [matchStatus]);
  const autoCanceledRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      matchStatus === "pending_approval" &&
      deadlineMs &&
      nowMs >= deadlineMs &&
      !respondMatch.isPending &&
      match?.id &&
      autoCanceledRef.current !== match.id
    ) {
      autoCanceledRef.current = match.id;
      respondMatch.mutate({ approve: false, autoCancel: true });
    }
  }, [matchStatus, deadlineMs, nowMs, respondMatch, match?.id]);


  // ピーク料金は依頼作成後でも、支払い前であれば依頼者がON/OFFを切り替え可能。
  // 切り替えると peak_fee と total_fee を再計算して requests テーブルに反映する。
  const hasPaidMain = payments.some((p) => p.status === "paid" && p.kind === "main");
  const canTogglePeak =
    !hasPaidMain && request && request.status !== "completed" && request.status !== "canceled";

  const togglePeak = useMutation({
    mutationFn: async (next: boolean) => {
      if (!request) throw new Error("not loaded");
      if (!canTogglePeak) throw new Error(t("request.peakLocked"));
      const peakFee = next ? PEAK_FEE : 0;
      const totalFee =
        (request.base_fee ?? 0) + (request.time_fee ?? 0) + peakFee + (request.extra_fee ?? 0);
      const { error } = await supabase
        .from("requests")
        .update({ is_peak: next, peak_fee: peakFee, total_fee: totalFee })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("request.peakUpdated"));
      qc.invalidateQueries({ queryKey: ["request", id] });
    },
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
              <h1 className="font-serif text-2xl">
                {request.request_number != null && (
                  <span className="text-base font-mono text-muted-foreground mr-2">
                    #{String(request.request_number).padStart(4, "0")}
                  </span>
                )}
                {request.store_name}
              </h1>
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

        {/* ピーク料金トグル: 支払い前のみ変更可能 */}
        <Card className="p-6 mt-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">{t("request.togglePeakAfter")}</div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {canTogglePeak ? t("request.togglePeakAfterHelp") : t("request.peakLocked")}
              </p>
              <p className="text-xs mt-1">
                {t("fees.peak")}: {formatYen(request.is_peak ? PEAK_FEE : 0)}
              </p>
            </div>
            <Switch
              checked={request.is_peak}
              disabled={!canTogglePeak || togglePeak.isPending}
              onCheckedChange={(v) => togglePeak.mutate(v)}
            />
          </div>
        </Card>

        {/* 代行者からのメッセージ */}
        {match && (() => {
          const m = match as unknown as {
            worker_features?: string | null;
            arrival_note?: string | null;
            start_note?: string | null;
            completion_note?: string | null;
          };
          const hasAny = m.worker_features || m.arrival_note || m.start_note || m.completion_note;
          if (!hasAny) return null;
          return (
            <Card className="p-6 mt-6 space-y-3">
              <div className="text-sm font-medium">代行者からのお知らせ</div>
              {m.worker_features && (
                <div>
                  <div className="text-xs text-muted-foreground">特徴 / 整理券番号</div>
                  <p className="text-sm whitespace-pre-wrap">{m.worker_features}</p>
                </div>
              )}
              {m.arrival_note && (
                <div>
                  <div className="text-xs text-muted-foreground">現地到着時</div>
                  <p className="text-sm whitespace-pre-wrap">{m.arrival_note}</p>
                </div>
              )}
              {m.start_note && (
                <div>
                  <div className="text-xs text-muted-foreground">業務開始時</div>
                  <p className="text-sm whitespace-pre-wrap">{m.start_note}</p>
                </div>
              )}
              {m.completion_note && (
                <div>
                  <div className="text-xs text-muted-foreground">完了時</div>
                  <p className="text-sm whitespace-pre-wrap">{m.completion_note}</p>
                </div>
              )}
            </Card>
          );
        })()}




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

        {/* 受注承認フロー: 代行者からの受注申請待ち */}
        {match && matchStatus === "pending_approval" && (
          <Card className="p-6 mt-6 border-primary/40 bg-primary/5">
            <div className="text-sm font-medium mb-1">代行者から受注申請が届いています</div>
            <p className="text-xs text-muted-foreground mb-3">
              承認すると決済のオーソリ（与信確保）を行い、代行者に業務開始の許可が出ます。
              オーソリ段階では請求は確定せず、業務完了時に確定します。キャンセル時はオーソリを解除します。
            </p>
            {deadlineMs && (
              <p className="text-xs mb-3 font-medium text-amber-700">
                {nowMs < deadlineMs
                  ? `残り ${Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000))} 秒以内に承認されない場合、自動的にキャンセルされます`
                  : "承認期限を過ぎたため自動キャンセル処理中..."}
              </p>
            )}
            <div className="mb-3">
              <label className="text-xs font-medium block mb-1">代行者へのコメント（任意）</label>
              <Textarea
                value={approvalComment}
                onChange={(e) => setApprovalComment(e.target.value)}
                rows={3}
                maxLength={300}
                placeholder="待ち合わせ場所や依頼のポイントなど、承認時に代行者へ伝えたい内容"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => respondMatch.mutate({ approve: true })} disabled={respondMatch.isPending}>
                承認してオーソリへ進む
              </Button>
              <Button variant="outline" onClick={() => respondMatch.mutate({ approve: false })} disabled={respondMatch.isPending}>
                拒否する
              </Button>
            </div>
          </Card>
        )}

        {/* 自動キャンセル通知 */}
        {match && (match as unknown as { auto_canceled_at?: string | null }).auto_canceled_at && (
          <Card className="p-4 mt-6 border-amber-300 bg-amber-50">
            <div className="text-sm font-medium text-amber-900">受注申請は自動キャンセルされました</div>
            <p className="text-xs text-amber-800 mt-1">
              5分以内に承認されなかったため、受注申請を自動的にキャンセルしました。依頼は再度公開されています。
            </p>
          </Card>
        )}

        {/* 受け取り確認フロー */}
        {match && matchStatus === "awaiting_confirmation" && (() => {
          const m = match as unknown as { confirm_deadline_at?: string | null };
          const deadline = m.confirm_deadline_at ? new Date(m.confirm_deadline_at).getTime() : null;
          const remainingMin = deadline ? Math.max(0, Math.ceil((deadline - nowMs) / 60_000)) : null;
          return (
            <Card className="p-6 mt-6 border-primary/50 bg-primary/5 space-y-3">
              <div className="text-sm font-medium">代行者から完了報告が届きました</div>
              <p className="text-xs text-muted-foreground">
                内容を確認し「受け取り確認」で決済を確定してください。
                問題がある場合は「異議を申し立てる」から管理者へ連絡できます。
                {remainingMin !== null && (
                  <span className="block mt-1 text-amber-700 font-medium">
                    残り約 {remainingMin} 分。無応答の場合は自動的に確認され、決済が確定します。
                  </span>
                )}
              </p>
              {!showDispute ? (
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={() => confirmDone.mutate()} disabled={confirmDone.isPending}>
                    受け取り確認して決済確定
                  </Button>
                  <Button variant="outline" onClick={() => setShowDispute(true)}>
                    異議を申し立てる
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-xs">異議の内容（管理者に共有されます）</Label>
                  <Textarea
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    rows={4}
                    maxLength={500}
                    placeholder="例）受け取れていない、商品が違うなど"
                  />
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="destructive" onClick={() => disputeDone.mutate()} disabled={disputeDone.isPending || disputeReason.trim().length < 5}>
                      異議を送信
                    </Button>
                    <Button variant="ghost" onClick={() => setShowDispute(false)}>戻る</Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })()}

        {match && matchStatus === "disputed" && (
          <Card className="p-4 mt-6 border-red-300 bg-red-50">
            <div className="text-sm font-medium text-red-900">異議申立を受付中です</div>
            <p className="text-xs text-red-800 mt-1">管理者が内容を確認しています。決済はまだ確定していません。</p>
          </Card>
        )}


        {/* Actions: ステータス連動で自動制御 */}
        {(() => {
          const rs = request.status;

          const hasPaid = payments.some((p) => p.status === "paid" && p.kind === "main");
          const hasAuth = payments.some((p) => p.status === "authorized" && p.kind === "main");
          // 支払いボタン: 承認済みでオーソリも支払いも無い時のみ
          const showPay = matchStatus === "approved" && !hasPaid && !hasAuth;
          // キャンセル可否
          const cancelable = rs !== "completed" && rs !== "canceled";
          const cancelHint =
            !match || matchStatus === "pending_approval" ? "無料でキャンセルできます"
            : matchStatus === "approved" && !hasPaid ? "オーソリを解除して無料でキャンセルします"
            : rs === "arrived" ? "到着済のため基本料金・ピーク料金が発生します"
            : rs === "in_progress" ? "業務中のため経過分の料金が発生します"
            : "キャンセルできません";
          return (
            <Card className="p-6 mt-6 space-y-3">
              {showPay && (
                <Button className="w-full" onClick={() => startPay.mutate()} disabled={startPay.isPending}>
                  {t("request.actions.pay")}（オーソリ）
                </Button>
              )}
              {hasAuth && !hasPaid && (
                <div className="text-xs rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 p-3">
                  ✓ オーソリ済み（与信確保）。業務完了時に決済が確定します。
                </div>
              )}

              {cancelable && (
                <>
                  {(rs === "in_progress" || rs === "arrived") && (
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
                  )}

                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="destructive" className="w-full">{t("request.actions.cancel")}</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>{t("request.actions.cancel")}</DialogTitle></DialogHeader>
                      <p className="text-sm">{cancelHint}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {t("request.cancelConfirm", { amount: refundEstimate.refund.toLocaleString() })}
                      </p>
                      <DialogFooter>
                        <Button variant="destructive" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                          キャンセル実行
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </>
              )}
              {!cancelable && (
                <div className="text-xs text-muted-foreground text-center">
                  {rs === "completed" ? "完了済みの依頼です" : "キャンセル済みの依頼です"}
                </div>
              )}
            </Card>
          );
        })()}

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
