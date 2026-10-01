import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Flag, Ban, Undo2, Trash2 } from "lucide-react";

type Report = {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  request_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
};

const REASON_LABELS: Record<string, string> = {
  harassment: "迷惑行為・嫌がらせ",
  inappropriate: "不適切な内容・写真",
  fraud: "詐欺・金銭トラブルの疑い",
  no_show: "無断キャンセル・来ない",
  other: "その他",
};

export const Route = createFileRoute("/_authenticated/admin/reports")({
  head: () => ({
    meta: [
      { title: "通報管理 — ＮＡＲＡＢＯＵ" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminReports,
});

function AdminReports() {
  const qc = useQueryClient();
  const [resolveTarget, setResolveTarget] = useState<Report | null>(null);
  const [note, setNote] = useState("");

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["admin-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports" as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Report[];
    },
    refetchInterval: 15000,
  });

  const { data: profiles = {} } = useQuery({
    queryKey: ["admin-report-profiles", reports.map((r) => r.reported_user_id).join(",")],
    enabled: reports.length > 0,
    queryFn: async () => {
      const ids = [...new Set(reports.flatMap((r) => [r.reporter_id, r.reported_user_id]))];
      const { data } = await supabase.from("profiles").select("id, name, suspended_at").in("id", ids);
      const map: Record<string, { name: string; suspended_at: string | null }> = {};
      (data ?? []).forEach((p) => { map[p.id] = p as { name: string; suspended_at: string | null }; });
      return map;
    },
  });

  const resolve = useMutation({
    mutationFn: async (r: Report) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("reports" as never).update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: u.user?.id ?? null,
        resolution_note: note.trim() || null,
      } as never).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("対応済みにしました");
      setResolveTarget(null);
      setNote("");
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const suspend = useMutation({
    mutationFn: async ({ userId, suspend: s }: { userId: string; suspend: boolean }) => {
      const { error } = await supabase.from("profiles").update({
        suspended_at: s ? new Date().toISOString() : null,
      } as never).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.suspend ? "アカウントを停止しました" : "停止を解除しました");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelRequest = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.from("requests").update({ status: "canceled" }).eq("id", requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("依頼を取り消しました（コンテンツ削除相当）");
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        <Link to="/admin" className="text-sm text-muted-foreground inline-flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> 管理コンソールへ戻る
        </Link>
        <h1 className="font-serif text-2xl mb-1 flex items-center gap-2">
          <Flag className="w-5 h-5" /> 通報管理
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          ユーザーからの通報一覧。24時間以内の確認・対応がポリシーです（App Store Guideline 1.2）。
        </p>

        {isLoading && <div className="p-10 text-center text-muted-foreground">読み込み中…</div>}
        {!isLoading && reports.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">通報はありません</Card>
        )}

        <div className="space-y-4">
          {reports.map((r) => {
            const reported = profiles[r.reported_user_id];
            const suspended = !!reported?.suspended_at;
            return (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={r.status === "open" ? "destructive" : "secondary"}>
                        {r.status === "open" ? "未対応" : "対応済み"}
                      </Badge>
                      <span className="text-sm font-medium">{REASON_LABELS[r.reason] ?? r.reason}</span>
                      {suspended && <Badge variant="outline" className="border-destructive text-destructive">停止中</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(r.created_at).toLocaleString("ja-JP")} ・
                      通報者: {profiles[r.reporter_id]?.name ?? r.reporter_id.slice(0, 8)} →
                      対象: {reported?.name ?? r.reported_user_id.slice(0, 8)}
                    </div>
                  </div>
                </div>
                {r.details && <p className="text-sm mt-2 whitespace-pre-wrap">{r.details}</p>}
                {r.resolution_note && (
                  <p className="text-xs mt-2 text-muted-foreground">対応メモ: {r.resolution_note}</p>
                )}
                <div className="flex gap-2 mt-3 flex-wrap">
                  {r.request_id && (
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/customer/request/$id" params={{ id: r.request_id }}>依頼を確認</Link>
                    </Button>
                  )}
                  {r.request_id && (
                    <Button
                      size="sm" variant="outline"
                      onClick={() => cancelRequest.mutate(r.request_id!)}
                      disabled={cancelRequest.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> 依頼を取り消す
                    </Button>
                  )}
                  {suspended ? (
                    <Button
                      size="sm" variant="outline"
                      onClick={() => suspend.mutate({ userId: r.reported_user_id, suspend: false })}
                      disabled={suspend.isPending}
                    >
                      <Undo2 className="w-3.5 h-3.5 mr-1" /> 停止を解除
                    </Button>
                  ) : (
                    <Button
                      size="sm" variant="destructive"
                      onClick={() => suspend.mutate({ userId: r.reported_user_id, suspend: true })}
                      disabled={suspend.isPending}
                    >
                      <Ban className="w-3.5 h-3.5 mr-1" /> アカウント停止
                    </Button>
                  )}
                  {r.status === "open" && (
                    <Button size="sm" onClick={() => { setResolveTarget(r); setNote(""); }}>
                      対応済みにする
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </main>

      <Dialog open={!!resolveTarget} onOpenChange={(o) => !o && setResolveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>対応済みにする</DialogTitle>
            <DialogDescription>対応内容をメモに残してください（任意）。</DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="resolution-note" className="text-xs">対応メモ</Label>
            <Textarea
              id="resolution-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="例: 対象ユーザーを停止し、依頼を取り消しました"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResolveTarget(null)}>キャンセル</Button>
            <Button onClick={() => resolveTarget && resolve.mutate(resolveTarget)} disabled={resolve.isPending}>
              完了
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
