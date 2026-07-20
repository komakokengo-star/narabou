import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { ArrowLeft, MapPin } from "lucide-react";
import { requestCompletion } from "@/lib/payments.functions";
import { reverseGeocode, forwardGeocode } from "@/lib/geocode.functions";

const DISTANCE_THRESHOLD_M = 200;
function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

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

  const storeAddress = (match?.requests as { store_address?: string } | undefined)?.store_address ?? "";
  const { data: storeCoords } = useQuery({
    queryKey: ["store-geocode", storeAddress],
    queryFn: async () => await forwardGeocode({ data: { address: storeAddress } }),
    enabled: !!storeAddress,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const { data: checkins = [] } = useQuery({
    queryKey: ["worker-checkins", matchId],
    queryFn: async () => {
      const { data } = await supabase.from("checkins").select("*").eq("match_id", matchId).order("timestamp", { ascending: false });
      return data ?? [];
    },
    refetchInterval: 10000,
  });

  type MatchUpdate = Partial<{ arrival_time: string; start_time: string; end_time: string; status: string; arrival_note: string | null; start_note: string | null; completion_note: string | null; worker_features: string | null }>;
  type RequestUpdate = Partial<{ status: "open" | "matched" | "arrived" | "in_progress" | "completed" | "canceled" }>;
  const updateStatus = useMutation({
    mutationFn: async (patch: { req?: RequestUpdate; match?: MatchUpdate }) => {
      if (patch.match) await supabase.from("matches").update(patch.match as never).eq("id", matchId);
      if (patch.req && match?.request_id)
        await supabase.from("requests").update(patch.req).eq("id", match.request_id);
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success(t("workerJob.updated")); },
    onError: (e: Error) => toast.error(e.message),
  });

  const reportCompletion = useMutation({
    mutationFn: async () => {
      if (!match?.request_id) throw new Error("Request not found");
      return await requestCompletion({ data: { requestId: match.request_id, completionNote: completionNote || null } });
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success(t("workerJob.completionSent")); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [workerFeatures, setWorkerFeatures] = useState("");
  const [arrivalNote, setArrivalNote] = useState("");
  const [gps, setGps] = useState<{ lat: number; lng: number; address: string | null } | null>(null);
  const fetchGps = useMutation({
    mutationFn: async () => {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10000 }),
      );
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      let address: string | null = null;
      try {
        const r = await reverseGeocode({ data: { lat, lng } });
        address = r.address;
      } catch (e) {
        console.warn("reverse geocode error", e);
      }
      return { lat, lng, address };
    },
    onSuccess: (v) => setGps(v),
    onError: (e: Error) => toast.error(e.message || t("workerJob.gpsError")),
  });
  const [startNote, setStartNote] = useState("");
  const [completionNote, setCompletionNote] = useState("");

  const saveFeatures = useMutation({
    mutationFn: async (v: string) => {
      await supabase.from("matches").update({ worker_features: v || null } as never).eq("id", matchId);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["worker-match", matchId] }); toast.success(t("workerJob.featuresSaved")); },
    onError: (e: Error) => toast.error(e.message),
  });


  const [waitTime, setWaitTime] = useState(0);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const checkin = useMutation({
    mutationFn: async () => {
      let lat: number | null = null;
      let lng: number | null = null;
      let missingLocation = false;
      let tooFar = false;
      let distanceM: number | null = null;
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) => {
          if (!("geolocation" in navigator)) return rej(new Error("geolocation unsupported"));
          navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000 });
        });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch (err) {
        missingLocation = true;
        const code = (err as GeolocationPositionError | undefined)?.code;
        if (code === 1) {
          toast.warning(t("workerJob.gpsDenied"));
        } else {
          toast.warning(t("workerJob.gpsUnavailable"));
        }
      }
      if (lat != null && lng != null && storeCoords?.lat != null && storeCoords.lng != null) {
        distanceM = haversineMeters({ lat, lng }, { lat: storeCoords.lat, lng: storeCoords.lng });
        if (distanceM > DISTANCE_THRESHOLD_M) tooFar = true;
      }
      let photoUrl: string | null = null;
      if (file) {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;
        if (!uid) throw new Error(t("workerJob.notAuthenticated"));
        const path = `${uid}/${matchId}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("checkin-photos").upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        const { data: signed } = await supabase.storage.from("checkin-photos").createSignedUrl(path, 60 * 60 * 24 * 7);
        photoUrl = signed?.signedUrl ?? null;
      }
      const { error } = await supabase.from("checkins").insert({
        match_id: matchId,
        location_lat: lat,
        location_lng: lng,
        wait_time: waitTime,
        note: note || null,
        photo_url: photoUrl,
      });
      if (error) throw error;
      return { missingLocation, tooFar, distanceM };
    },
    onSuccess: (data) => {
      toast.success(t("workerJob.checkinSent"));
      if (data?.missingLocation) {
        toast.warning(t("workerJob.wrongLocationNoGps"), { duration: 8000 });
      } else if (data?.tooFar) {
        toast.warning(
          t("workerJob.wrongLocationDistance", { dist: data.distanceM != null ? Math.round(data.distanceM) : "?" }),
          { duration: 10000 },
        );
      }
      setNote(""); setFile(null);
      qc.invalidateQueries({ queryKey: ["worker-checkins", matchId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const matchFeatures = (match as unknown as { worker_features?: string | null } | null)?.worker_features ?? "";
  useEffect(() => {
    setWorkerFeatures(matchFeatures);
  }, [matchFeatures]);

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
            <Badge variant="secondary">{(() => {
              const ms = (match as unknown as { status?: string }).status;
              if (ms === "awaiting_confirmation") return t("workerJob.statusAwaitingConfirmation");
              if (ms === "disputed") return t("workerJob.statusDisputed");
              if (ms === "completed") return t("request.status.completed");
              return t(`request.status.${req.status}`);
            })()}</Badge>
          </div>
        </Card>

        {(match as unknown as { approval_comment?: string | null }).approval_comment && (
          <Card className="p-4 mt-6 border-primary/40 bg-primary/5">
            <div className="text-xs font-medium mb-1">{t("workerJob.customerComment")}</div>
            <p className="text-sm whitespace-pre-wrap">{(match as unknown as { approval_comment: string }).approval_comment}</p>
          </Card>
        )}

        {(match as unknown as { auto_canceled_at?: string | null }).auto_canceled_at && (
          <Card className="p-4 mt-6 border-amber-300 bg-amber-50">
            <div className="text-sm font-medium text-amber-900">{t("workerJob.autoCanceledTitle")}</div>
            <p className="text-xs text-amber-800 mt-1">
              {t("workerJob.autoCanceledDesc")}
            </p>
          </Card>
        )}

        <Card className="p-6 mt-6 space-y-3">
          <div className="font-medium mb-2">{t("workerJob.featuresTitle")}</div>
          <p className="text-xs text-muted-foreground">
            {t("workerJob.featuresHint")}
          </p>
          <Textarea
            value={workerFeatures}
            onChange={(e) => setWorkerFeatures(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder={t("workerJob.featuresPlaceholder")}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => saveFeatures.mutate(workerFeatures)} disabled={saveFeatures.isPending}>
              {t("workerJob.saveFeatures")}
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setWorkerFeatures(t("workerJob.featuresExample"))}>
              {t("workerJob.useExample")}
            </Button>
          </div>
        </Card>

        <Card className="p-6 mt-6 space-y-4">
          <div className="font-medium mb-2">{t("workerJob.statusOps")}</div>
          {(match as unknown as { status: string }).status === "pending_approval" && (
            <div className="text-xs rounded-md bg-amber-50 border border-amber-200 text-amber-800 p-3">
              {t("workerJob.pendingApprovalHint")}
            </div>
          )}
          {(match as unknown as { status: string }).status !== "pending_approval" && !match.arrival_time && (
            <div className="space-y-2">
              <Label>{t("workerJob.arrivalMsgLabel")}</Label>
              <Textarea
                value={arrivalNote}
                onChange={(e) => setArrivalNote(e.target.value)}
                rows={2}
                maxLength={300}
                placeholder={t("workerJob.arrivalPlaceholder")}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => updateStatus.mutate({ match: { arrival_time: new Date().toISOString(), status: "arrived", arrival_note: arrivalNote || null }, req: { status: "arrived" } })}>
                  {t("request.actions.arrived")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => fetchGps.mutate()} disabled={fetchGps.isPending}>
                  <MapPin className="w-4 h-4 mr-1" />
                  {fetchGps.isPending ? t("workerJob.fetching") : t("workerJob.fetchGps")}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setArrivalNote(t("workerJob.arrivalExample"))}>
                  {t("workerJob.useExample")}
                </Button>
              </div>
              {gps && (
                <div className="text-xs rounded-md border border-border bg-muted/40 p-3 space-y-1">
                  <div className="font-mono">
                    {t("workerJob.gpsCode")}: {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}
                  </div>
                  <div className="text-muted-foreground">
                    {t("workerJob.gpsAddress")}: {gps.address ?? t("workerJob.gpsAddressUnavailable")}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => {
                      const line = `${t("workerJob.gpsCurrentPositionPrefix")}: ${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}${gps.address ? `（${gps.address}）` : ""}`;
                      setArrivalNote((prev) => (prev ? `${prev}\n${line}` : line));
                    }}
                  >
                    {t("workerJob.gpsAddToMessage")}
                  </Button>
                </div>
              )}
            </div>
          )}

          {match.arrival_time && !match.start_time && (
            <div className="space-y-2">
              <Label>{t("workerJob.startMsgLabel")}</Label>
              <Textarea
                value={startNote}
                onChange={(e) => setStartNote(e.target.value)}
                rows={2}
                maxLength={300}
                placeholder={t("workerJob.startPlaceholder")}
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => updateStatus.mutate({ match: { start_time: new Date().toISOString(), status: "in_progress", start_note: startNote || null }, req: { status: "in_progress" } })}>
                  {t("request.actions.startQueue")}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setStartNote(t("workerJob.startExample"))}>
                  {t("workerJob.useExample")}
                </Button>
              </div>
            </div>
          )}
          {match.start_time && !match.end_time && (
            <div className="space-y-2">
              <Label>{t("workerJob.completionMsgLabel")}</Label>
              <Textarea
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                rows={2}
                maxLength={300}
                placeholder={t("workerJob.completionPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">
                {t("workerJob.completionNote")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="default" onClick={() => reportCompletion.mutate()} disabled={reportCompletion.isPending}>
                  {t("workerJob.completionButton")}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setCompletionNote(t("workerJob.completionExample"))}>
                  {t("workerJob.useExample")}
                </Button>
              </div>
            </div>
          )}
          {(match as unknown as { status: string }).status === "awaiting_confirmation" && (() => {
            const m = match as unknown as { confirm_deadline_at?: string | null };
            const deadline = m.confirm_deadline_at ? new Date(m.confirm_deadline_at).getTime() : null;
            const remaining = deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 60_000)) : null;
            return (
              <div className="text-sm rounded-md border border-amber-300 bg-amber-50 text-amber-900 p-3">
                <div className="font-medium">{t("workerJob.awaitingConfirmTitle")}</div>
                {remaining !== null && (
                  <div className="text-xs mt-1">{t("workerJob.awaitingConfirmRemaining", { min: remaining })}</div>
                )}
              </div>
            );
          })()}
          {(match as unknown as { status: string }).status === "disputed" && (() => {
            const m = match as unknown as { dispute_reason?: string | null };
            return (
              <div className="text-sm rounded-md border border-red-300 bg-red-50 text-red-900 p-3 space-y-1">
                <div className="font-medium">{t("workerJob.disputeTitle")}</div>
                {m.dispute_reason && <p className="text-xs whitespace-pre-wrap">{t("workerJob.disputeReason")}: {m.dispute_reason}</p>}
              </div>
            );
          })()}
        </Card>


        <Card className="p-6 mt-6">
          <div className="font-medium mb-3">{t("workerJob.checkinTitle")}</div>
          <form onSubmit={(e) => { e.preventDefault(); checkin.mutate(); }} className="space-y-3">
            <div>
              <Label>{t("workerJob.waitTimeLabel")}</Label>
              <Input type="number" min={0} value={waitTime} onChange={(e) => setWaitTime(Number(e.target.value))} />
            </div>
            <div>
              <Label>{t("workerJob.noteLabel")}</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} />
            </div>
            <div>
              <Label>{t("workerJob.photoLabel")}</Label>
              <Input type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <Button type="submit" disabled={checkin.isPending} className="w-full">
              {checkin.isPending ? t("common.loading") : t("workerJob.checkinTitle")}
            </Button>
          </form>
        </Card>

        <Card className="p-6 mt-6">
          <div className="font-medium mb-3">{t("workerJob.historyTitle")} ({checkins.length})</div>
          <div className="space-y-3">
            {checkins.map((c) => (
              <div key={c.id} className="flex gap-3 border-b border-border pb-3 last:border-0">
                {c.photo_url && <img src={c.photo_url} alt="" className="w-16 h-16 object-cover rounded" />}
                <div className="text-xs">
                  <div>{new Date(c.timestamp).toLocaleString()}</div>
                  {c.wait_time != null && <div>{c.wait_time}{t("common.minutes")}</div>}
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
