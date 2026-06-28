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
import { calcFee, formatYen } from "@/lib/fees";
import { StoreSearchMap } from "@/components/StoreSearchMap";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/customer/")({
  component: CustomerHome,
});

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

  const [storeName, setStoreName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [desiredTime, setDesiredTime] = useState("");
  const [estimatedWait, setEstimatedWait] = useState(30);
  const [isPeak, setIsPeak] = useState(false);
  const [notes, setNotes] = useState("");

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
          desired_time: desiredTime || null,
          estimated_wait_minutes: estimatedWait,
          is_peak: isPeak,
          notes: notes || null,
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
      setStoreName(""); setStoreAddress(""); setNotes("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fee = calcFee({ waitMinutes: estimatedWait, isPeak });

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-10 max-w-4xl">
        <h1 className="font-serif text-3xl mb-6">{t("role.customer")}</h1>

        <Card className="p-6 mb-8">
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
              <Label>{t("request.notes")}</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={3} />
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
          {requests.map((r) => (
            <Link key={r.id} to="/customer/request/$id" params={{ id: r.id }}>
              <Card className="p-4 hover:border-primary transition flex items-center justify-between">
                <div>
                  <div className="font-medium">{r.store_name}</div>
                  <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <Badge variant="secondary">{t(`request.status.${r.status}`)}</Badge>
                  <div className="text-sm mt-1">{formatYen(r.total_fee)}</div>
                </div>
              </Card>
            </Link>
          ))}
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
