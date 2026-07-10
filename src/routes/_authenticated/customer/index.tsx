import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Trash2, RotateCcw } from "lucide-react";
import { calcFee, formatYen } from "@/lib/fees";
import { StoreSearchMap } from "@/components/StoreSearchMap";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/customer/")({
  component: CustomerHome,
});

function stripExamplePrefix(s: string) {
  return s.replace(/^例）\n?/, "");
}

function CustomerHome() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: requests = [] } = useQuery({
    queryKey: ["customer-requests", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requests")
        .select("*")
        .eq("customer_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: pendingMatches = [] } = useQuery({
    queryKey: ["customer-pending-matches", user?.id],
    enabled: !!user && requests.length > 0,
    refetchInterval: 8000,
    queryFn: async () => {
      const ids = requests.map((r) => r.id);
      const { data, error } = await supabase
        .from("matches")
        .select("id, request_id, status, created_at")
        .in("request_id", ids)
        .eq("status", "pending_approval");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [storeName, setStoreName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [desiredTime, setDesiredTime] = useState("");
  const [estimatedWait, setEstimatedWait] = useState(30);
  const [isPeak, setIsPeak] = useState(false);
  const [notes, setNotes] = useState("");
  const [landmark, setLandmark] = useState("");
  const [numberDisplayMethod, setNumberDisplayMethod] = useState("");
  

  const prefillFromRequest = (r: typeof requests[number]) => {
    setStoreName(r.store_name ?? "");
    setStoreAddress(r.store_address ?? "");
    setDesiredTime("");
    setEstimatedWait(r.estimated_wait_minutes ?? 30);
    setIsPeak(!!r.is_peak);
    setNotes(r.notes ?? "");
    setLandmark(r.landmark ?? "");
    setNumberDisplayMethod(r.number_display_method ?? "");
    toast.success("依頼内容を入力欄に反映しました。希望時間を設定してください。");
    setTimeout(() => {
      document.getElementById("create-request-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("unauth");
      const fee = calcFee({ waitMinutes: estimatedWait, isPeak });
      const { data, error } = await supabase
        .from("requests")
        .insert({
          customer_id: user.id,
          store_name: storeName,
          store_address: storeAddress || null,
          desired_time: desiredTime ? new Date(desiredTime).toISOString() : null,
          estimated_wait_minutes: estimatedWait,
          is_peak: isPeak,
          notes: notes || null,
          landmark: landmark || null,
          number_display_method: numberDisplayMethod || null,
          base_fee: fee.base,
          time_fee: fee.time,
          peak_fee: fee.peak,
          extra_fee: 0,
          total_fee: fee.total,
          status: "open",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("依頼を作成しました");
      qc.invalidateQueries({ queryKey: ["customer-requests"] });
      setStoreName(""); setStoreAddress(""); setNotes(""); setLandmark(""); setNumberDisplayMethod("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("削除しました");
      qc.invalidateQueries({ queryKey: ["customer-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fee = calcFee({ waitMinutes: estimatedWait, isPeak });

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-10 max-w-4xl">
        <h1 className="font-serif text-3xl mb-6">{t("role.customer")}</h1>

        {pendingMatches.length > 0 && (
          <div className="mb-6 space-y-2">
            {pendingMatches.map((m) => {
              const req = requests.find((r) => r.id === m.request_id);
              const deadline = new Date(m.created_at).getTime() + 5 * 60 * 1000;
              const remainSec = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
              return (
                <Link key={m.id} to="/customer/request/$id" params={{ id: m.request_id }}>
                  <Card className="p-4 border-primary/40 bg-primary/5 hover:border-primary transition">
                    <div className="text-sm font-medium">代行者から受注申請が届いています</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {req?.store_name ?? ""} — 承認/拒否を選択してください
                    </div>
                    <div className="text-xs mt-1 font-medium text-amber-700">
                      残り {remainSec} 秒以内に承認されない場合、自動キャンセルされます
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}


        <Card id="create-request-form" className="p-6 mb-8 scroll-mt-20">
          <h2 className="font-medium mb-4">{t("request.create")}</h2>
          <form
            onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
            className="grid sm:grid-cols-2 gap-4"
          >
            <StoreSearchMap
              storeName={storeName}
              storeAddress={storeAddress}
              onChange={(v) => {
                setStoreName(v.storeName);
                setStoreAddress(v.storeAddress);
              }}
            />
            <div>
              <Label>{t("request.desiredTime")}</Label>
              <Input type="datetime-local" value={desiredTime} onChange={(e) => setDesiredTime(e.target.value)} />
            </div>
            <div>
              <Label>{t("request.estimatedWait")} ({t("common.minutes")})</Label>
              <Input type="number" min={10} max={300} value={estimatedWait} onChange={(e) => setEstimatedWait(Number(e.target.value))} />
            </div>
            <div className="sm:col-span-2 rounded-md border border-border/60 bg-muted/30 p-3">
              <div className="flex items-center gap-3">
                <Switch checked={isPeak} onCheckedChange={setIsPeak} id="peak" />
                <Label htmlFor="peak" className="cursor-pointer">{t("request.isPeak")}</Label>
              </div>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                {t("request.isPeakHelp")}
              </p>
            </div>
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <Label>{t("request.notes")}</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setNotes(stripExamplePrefix(t("request.notesPlaceholder")))}
                >
                  例文を使う
                </Button>
              </div>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                rows={6}
                placeholder={t("request.notesPlaceholder")}
                className="placeholder:text-muted-foreground/60 placeholder:whitespace-pre-line"
              />
            </div>

            <div className="sm:col-span-2 rounded-md border border-border/60 bg-muted/30 p-4 space-y-3">
              <div>
                <div className="text-sm font-medium">{t("request.contactInfo")}</div>
                <p className="text-xs text-muted-foreground mt-1">{t("request.contactInfoDesc")}</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>{t("request.landmark")}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setLandmark(stripExamplePrefix(t("request.landmarkPlaceholder")))}
                  >
                    例文を使う
                  </Button>
                </div>
                <Textarea
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  maxLength={300}
                  rows={2}
                  placeholder={t("request.landmarkPlaceholder")}
                  className="placeholder:text-muted-foreground/60"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>{t("request.numberDisplayMethod")}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setNumberDisplayMethod(stripExamplePrefix(t("request.numberDisplayMethodPlaceholder")))}
                  >
                    例文を使う
                  </Button>
                </div>
                <Textarea
                  value={numberDisplayMethod}
                  onChange={(e) => setNumberDisplayMethod(e.target.value)}
                  maxLength={300}
                  rows={2}
                  placeholder={t("request.numberDisplayMethodPlaceholder")}
                  className="placeholder:text-muted-foreground/60"
                />
              </div>
            </div>

            <div className="sm:col-span-2 p-4 rounded-md bg-muted/40 text-sm space-y-1">
              <Row label={t("fees.base")} v={formatYen(fee.base)} />
              <Row label={`${t("fees.time")} (${estimatedWait}${t("common.minutes")})`} v={formatYen(fee.time)} />
              {fee.peak > 0 && <Row label={t("fees.peak")} v={formatYen(fee.peak)} />}
              <div className="border-t border-border my-2" />
              <Row label={t("fees.total")} v={formatYen(fee.total)} bold />
            </div>

            <div className="sm:col-span-2">
              <Button type="submit" disabled={create.isPending} className="w-full">
                {create.isPending ? t("common.loading") : t("request.create")}
              </Button>
            </div>
          </form>
        </Card>

        <h2 className="font-medium mb-3">{t("request.list")}</h2>
        <div className="space-y-3">
          {requests.length === 0 && <div className="text-sm text-muted-foreground">{t("common.noData")}</div>}
          {requests.map((r) => {
            const canDelete = r.status === "completed" || r.status === "canceled";
            return (
              <div key={r.id} className="relative">
                <Link to="/customer/request/$id" params={{ id: r.id }}>
                  <Card className="p-4 hover:border-primary transition flex items-center justify-between">
                    <div>
                      <div className="font-medium">
                        {r.request_number != null && (
                          <span className="text-xs font-mono text-muted-foreground mr-2">
                            #{String(r.request_number).padStart(4, "0")}
                          </span>
                        )}
                        {r.store_name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        希望 {r.desired_time ? new Date(r.desired_time).toLocaleString() : "—"}
                      </div>
                      <div className="text-[10px] text-muted-foreground/70">登録 {new Date(r.created_at).toLocaleString()}</div>
                    </div>
                    <div className={`text-right ${canDelete ? "pr-20" : "pr-8"}`}>
                      <Badge variant="secondary">{t(`request.status.${r.status}`)}</Badge>
                      <div className="text-sm mt-1">{formatYen(r.total_fee)}</div>
                    </div>
                  </Card>
                </Link>
                {canDelete && (
                  <div className="absolute top-3 right-3 flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="再依頼"
                      title="この内容で再依頼"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        prefillFromRequest(r);
                      }}
                      className="p-2 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="削除"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (confirm("この依頼を削除しますか？")) remove.mutate(r.id);
                      }}
                      className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function Row({ label, v, bold }: { label: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold text-base" : ""}`}>
      <span>{label}</span><span>{v}</span>
    </div>
  );
}
