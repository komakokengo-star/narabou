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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/worker/job/$id")({
  component: WorkerJob,
});

function WorkerJob() {
  const { id: matchId } = Route.useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: match } = useQuery({
    queryKey: ["worker-match", matchId],
    queryFn: async () => {
      const { data } = await supabase.from("matches").select("*, requests(*)").eq("id", matchId).maybeSingle();
      return data;
    },
    refetchInterval: 8000,
  });

  const { data: checkins = [] } = useQuery({
    queryKey: ["worker-checkins", matchId],
    queryFn: async () => {
      const { data } = await supabase.from("checkins").select("*").eq("match_id", matchId).order("timestamp", { ascending: false });
      return data ?? [];
    },
    refetchInterval: 10000,
  });

  const updateStatus = useMutation({
    mutationFn: async (patch: { req?: Record<string, unknown>; match?: Record<string, unknown> }) => {
      if (patch.match) await supabase.from("matches").update(patch.match).eq("id", matchId);
      if (patch.req && match?.request_id)
        await supabase.from("requests").update(patch.req).eq("id", match.request_id);
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("更新しました"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [waitTime, setWaitTime] = useState(0);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const checkin = useMutation({
    mutationFn: async () => {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000 }),
      );
      let photoUrl: string | null = null;
      if (file) {
        const path = `${matchId}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("checkin-photos").upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        const { data: signed } = await supabase.storage.from("checkin-photos").createSignedUrl(path, 60 * 60 * 24 * 7);
        photoUrl = signed?.signedUrl ?? null;
      }
      const { error } = await supabase.from("checkins").insert({
        match_id: matchId,
        location_lat: pos.coords.latitude,
        location_lng: pos.coords.longitude,
        wait_time: waitTime,
        note: note || null,
        photo_url: photoUrl,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("定点報告を送信しました");
      setNote(""); setFile(null);
      qc.invalidateQueries({ queryKey: ["worker-checkins", matchId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!match) return <div className="p-10 text-center">{t("common.loading")}</div>;
  const req = match.requests as { id: string; store_name: string; status: string; total_fee: number };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
        <Link to="/worker" className="text-sm text-muted-foreground inline-flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> {t("common.back")}
        </Link>

        <Card className="p-6">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="font-serif text-2xl">{req.store_name}</h1>
              <div className="text-xs text-muted-foreground">{new Date(match.created_at).toLocaleString()}</div>
            </div>
            <Badge variant="secondary">{t(`request.status.${req.status}`)}</Badge>
          </div>
        </Card>

        <Card className="p-6 mt-6 space-y-3">
          <div className="font-medium mb-2">ステータス操作</div>
          {!match.arrival_time && (
            <Button onClick={() => updateStatus.mutate({ match: { arrival_time: new Date().toISOString() }, req: { status: "arrived" } })}>
              {t("request.actions.arrived")}
            </Button>
          )}
          {match.arrival_time && !match.start_time && (
            <Button onClick={() => updateStatus.mutate({ match: { start_time: new Date().toISOString() }, req: { status: "in_progress" } })}>
              {t("request.actions.startQueue")}
            </Button>
          )}
          {match.start_time && !match.end_time && (
            <Button variant="default" onClick={() => updateStatus.mutate({ match: { end_time: new Date().toISOString() }, req: { status: "completed" } })}>
              {t("request.actions.complete")}
            </Button>
          )}
        </Card>

        <Card className="p-6 mt-6">
          <div className="font-medium mb-3">{t("request.actions.checkin")}</div>
          <form onSubmit={(e) => { e.preventDefault(); checkin.mutate(); }} className="space-y-3">
            <div>
              <Label>待ち時間 (分)</Label>
              <Input type="number" min={0} value={waitTime} onChange={(e) => setWaitTime(Number(e.target.value))} />
            </div>
            <div>
              <Label>備考</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} />
            </div>
            <div>
              <Label>写真</Label>
              <Input type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <Button type="submit" disabled={checkin.isPending} className="w-full">
              {checkin.isPending ? t("common.loading") : t("request.actions.checkin")}
            </Button>
          </form>
        </Card>

        <Card className="p-6 mt-6">
          <div className="font-medium mb-3">履歴 ({checkins.length})</div>
          <div className="space-y-3">
            {checkins.map((c) => (
              <div key={c.id} className="flex gap-3 border-b border-border pb-3 last:border-0">
                {c.photo_url && <img src={c.photo_url} alt="" className="w-16 h-16 object-cover rounded" />}
                <div className="text-xs">
                  <div>{new Date(c.timestamp).toLocaleString()}</div>
                  {c.wait_time != null && <div>{c.wait_time}分</div>}
                  {c.note && <div className="text-muted-foreground">{c.note}</div>}
                </div>
              </div>
            ))}
            {checkins.length === 0 && <div className="text-xs text-muted-foreground">{t("common.noData")}</div>}
          </div>
        </Card>
      </main>
    </div>
  );
}
