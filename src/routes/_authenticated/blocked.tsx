import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/blocked")({
  head: () => ({
    meta: [
      { title: "ブロックしたユーザー — ＮＡＲＡＢＯＵ" },
      { name: "description", content: "ブロックしたユーザーの確認とブロック解除ができます。" },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "ブロックしたユーザー — ＮＡＲＡＢＯＵ" },
      { property: "og:description", content: "ブロックしたユーザーの確認とブロック解除ができます。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BlockedUsersPage,
});

type BlockRow = { id: string; blocked_id: string; created_at: string };

function BlockedUsersPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: blocks = [], isLoading } = useQuery({
    queryKey: ["blocked-users", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blocks" as never)
        .select("id, blocked_id, created_at")
        .eq("blocker_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as BlockRow[];
      const ids = rows.map((r) => r.blocked_id);
      const names: Record<string, string> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, name").in("id", ids);
        (profs ?? []).forEach((p) => { names[p.id] = p.name; });
      }
      return rows.map((r) => ({ ...r, name: names[r.blocked_id] ?? "ユーザー" }));
    },
  });

  const unblock = useMutation({
    mutationFn: async (blockedId: string) => {
      const { error } = await supabase
        .from("blocks" as never)
        .delete()
        .eq("blocker_id", user!.id)
        .eq("blocked_id", blockedId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ブロックを解除しました。一覧に再び表示されます。");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-2xl space-y-4">
        <h1 className="font-serif text-2xl font-semibold">ブロックしたユーザー</h1>
        <p className="text-sm text-muted-foreground">
          ブロックを解除すると、その相手の依頼・案件が一覧に再び表示されます。相手には通知されません。
        </p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">読み込み中…</p>
        ) : blocks.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">ブロック中のユーザーはいません。</Card>
        ) : (
          <div className="space-y-2">
            {blocks.map((b) => (
              <Card key={b.id} className="p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{b.name}さん</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(b.created_at).toLocaleString("ja-JP")} にブロック
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => unblock.mutate(b.blocked_id)}
                  disabled={unblock.isPending}
                >
                  ブロック解除
                </Button>
              </Card>
            ))}
          </div>
        )}
        <Link to="/dashboard" className="text-sm text-primary underline">ダッシュボードへ戻る</Link>
      </main>
    </div>
  );
}
