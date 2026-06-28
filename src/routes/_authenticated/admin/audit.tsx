import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/audit")({
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
  component: AuditPage,
});

const ACTIONS = [
  "all",
  "manual_refund",
  "revert_request",
  "set_status",
  "manual_mark_paid",
  "manual_mark_failed",
  "force_cancel",
  "cancel_request",
] as const;

type ActionFilter = (typeof ACTIONS)[number];

function AuditPage() {
  const { t } = useTranslation();
  const [action, setAction] = useState<ActionFilter>("all");
  const [search, setSearch] = useState("");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      return data ?? [];
    },
    refetchInterval: 10000,
  });

  const actorIds = useMemo(
    () => Array.from(new Set(logs.map((l) => l.actor_id).filter(Boolean))) as string[],
    [logs],
  );

  const { data: actors = [] } = useQuery({
    queryKey: ["audit-actors", actorIds.join(",")],
    enabled: actorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles").select("id,name").in("id", actorIds);
      return data ?? [];
    },
  });
  const actorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of actors) m.set(a.id, a.name ?? a.id.slice(0, 8));
    return m;
  }, [actors]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (action !== "all" && l.action !== action) return false;
      if (search) {
        const hay = JSON.stringify(l).toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [logs, action, search]);

  const exportCsv = () => {
    const rows = [
      ["created_at", "actor", "action", "target_type", "target_id", "details"],
      ...filtered.map((l) => [
        new Date(l.created_at).toISOString(),
        actorMap.get(l.actor_id ?? "") ?? l.actor_id ?? "",
        l.action,
        l.target_type,
        l.target_id ?? "",
        JSON.stringify(l.details ?? {}),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-10 max-w-6xl">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="font-serif text-3xl">{t("audit.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("audit.subtitle")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/admin">← {t("admin.title")}</Link>
            </Button>
            <Button variant="outline" onClick={exportCsv}>
              {t("audit.exportCsv")}
            </Button>
          </div>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap items-center">
          <Select value={action} onValueChange={(v) => setAction(v as ActionFilter)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>
                  {t(`audit.actions.${a}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder={t("audit.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <div className="ml-auto text-sm text-muted-foreground">
            {filtered.length} / {logs.length}
          </div>
        </div>

        <Card className="overflow-hidden">
          {isLoading && (
            <div className="p-8 text-center text-muted-foreground">
              {t("common.loading")}
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              {t("common.noData")}
            </div>
          )}
          <div className="divide-y divide-border">
            {filtered.map((l) => (
              <div key={l.id} className="p-4 text-sm">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary">{t(`audit.actions.${l.action}`, l.action)}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {l.target_type}
                      {l.target_id ? ` · ${l.target_id.slice(0, 8)}` : ""}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(l.created_at).toLocaleString()} ·{" "}
                    {actorMap.get(l.actor_id ?? "") ?? (l.actor_id ? l.actor_id.slice(0, 8) : "system")}
                  </div>
                </div>
                {l.details && Object.keys(l.details).length > 0 && (
                  <pre className="text-xs bg-muted/40 rounded p-2 overflow-x-auto font-mono">
                    {JSON.stringify(l.details, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </Card>
      </main>
    </div>
  );
}
