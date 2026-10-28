import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getAvailabilityCounts } from "@/lib/availability.functions";
import { Button } from "@/components/ui/button";

export function AvailabilityCount({ area }: { area: string }) {
  const { user } = useAuth();
  const getCounts = useServerFn(getAvailabilityCounts);
  const query = useQuery({
    queryKey: ["availability-counts", user?.id],
    queryFn: () => getCounts(),
    enabled: !!user,
    refetchInterval: 30000,
    staleTime: 10000,
  });
  const count = query.data?.find((row) => row.area === area)?.available_count ?? 0;
  return (
    <div aria-live="polite" className="mt-3 space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <Users className="size-4 text-primary shrink-0" />
        {query.isPending ? "受付中の人数を確認中…" : query.isError ? <><span className="text-destructive">受付人数を取得できませんでした</span><Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>再試行</Button></> : <span>{area}で受付中：{count}人</span>}
      </div>
      {!query.isPending && !query.isError && <p className="text-xs text-muted-foreground">{count === 0 ? "現在受付中の代行者はいません。" : "現在の受付人数です。受注を保証するものではありません。"}</p>}
    </div>
  );
}