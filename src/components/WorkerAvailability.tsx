import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { AVAILABILITY_AREAS, isAvailabilityActive } from "@/lib/availability";
import { setMyAvailability } from "@/lib/availability.functions";
import { useWorkerAvailability } from "@/hooks/useWorkerAvailability";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function WorkerAvailability({ payoutReady }: { payoutReady: boolean }) {
  const { user } = useAuth();
  const query = useWorkerAvailability();
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const area = selectedArea ?? query.data?.area ?? "福岡";
  const active = isAvailabilityActive(query.data);
  const setState = useServerFn(setMyAvailability);
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (available: boolean) => {
      const validArea = AVAILABILITY_AREAS.find((item) => item === area);
      if (!validArea) throw new Error("受付エリアを選択してください");
      return setState({ data: { area: validArea, available } });
    },
    onSuccess: (state) => {
      qc.setQueryData(["worker-availability", user?.id], state);
      void qc.invalidateQueries({ queryKey: ["availability-counts"] });
      toast.success(state.is_available ? "受付を開始しました" : "受付を終了しました");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <section aria-label="代行の受付状況" className="mb-8 border-y border-border py-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 font-medium"><MapPin className="size-4 text-primary" />代行の受付状況</h2>
        <div className="flex items-center gap-3">
          <Label htmlFor="worker-available">{active ? "受付中" : "受付停止中"}</Label>
          <Switch id="worker-available" aria-label="受付中" checked={active} onCheckedChange={(value) => mutation.mutate(value)} disabled={query.isPending || query.isError || mutation.isPending || (!payoutReady && !active)} />
        </div>
      </div>
      <div className="max-w-sm space-y-2">
        <Label htmlFor="worker-area">受付エリア</Label>
        <Select value={area} onValueChange={setSelectedArea} disabled={active || mutation.isPending}>
          <SelectTrigger id="worker-area"><SelectValue /></SelectTrigger>
          <SelectContent>{AVAILABILITY_AREAS.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {!payoutReady && <p className="text-xs text-muted-foreground">受取口座の登録が完了すると受付を開始できます。</p>}
      <p className="text-xs text-muted-foreground">受付中はアプリを開いてお待ちください。5分間更新がないと受付を自動終了します。依頼の承認時も受付を終了します。</p>
      {query.isError && <div className="flex items-center gap-3 text-sm text-destructive">受付状況を取得できませんでした<Button variant="outline" size="sm" onClick={() => void query.refetch()}>再試行</Button></div>}
    </section>
  );
}