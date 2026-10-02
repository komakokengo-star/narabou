import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Flag, Ban } from "lucide-react";

const REPORT_REASONS = [
  { value: "harassment", label: "迷惑行為・嫌がらせ" },
  { value: "inappropriate", label: "不適切な内容・写真" },
  { value: "fraud", label: "詐欺・金銭トラブルの疑い" },
  { value: "no_show", label: "無断キャンセル・来ない" },
  { value: "other", label: "その他" },
];

type Props = {
  /** 通報・ブロックされる相手のユーザーID */
  targetUserId: string;
  /** 関連する依頼ID（任意） */
  requestId?: string;
  /** 相手の表示名（任意） */
  targetName?: string;
};

/**
 * 相手ユーザーの通報・ブロックUI（App Store Guideline 1.2 対応）。
 * 通報は管理者へ即時通知され、ブロックは自分の一覧から相手のコンテンツを即時除去する。
 */
export function ReportBlockActions({ targetUserId, requestId, targetName }: Props) {
  const qc = useQueryClient();
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [reason, setReason] = useState("harassment");
  const [details, setDetails] = useState("");

  const { data: myId } = useQuery({
    queryKey: ["my-user-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });

  const { data: alreadyBlocked } = useQuery({
    queryKey: ["block", myId, targetUserId],
    enabled: !!myId,
    queryFn: async () => {
      const { data } = await supabase
        .from("blocks" as never)
        .select("id")
        .eq("blocker_id", myId!)
        .eq("blocked_id", targetUserId)
        .maybeSingle();
      return !!data;
    },
  });

  const report = useMutation({
    mutationFn: async () => {
      if (!myId) throw new Error("ログインが必要です");
      const { error } = await supabase.from("reports" as never).insert({
        reporter_id: myId,
        reported_user_id: targetUserId,
        request_id: requestId ?? null,
        reason,
        details: details.trim() || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("通報を受け付けました。運営が24時間以内に確認・対応します。");
      setReportOpen(false);
      setDetails("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const block = useMutation({
    mutationFn: async () => {
      if (!myId) throw new Error("ログインが必要です");
      const { error } = await supabase.from("blocks" as never).insert({
        blocker_id: myId,
        blocked_id: targetUserId,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ブロックしました。この相手の依頼・案件はあなたの一覧に表示されなくなります。");
      setBlockOpen(false);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unblock = useMutation({
    mutationFn: async () => {
      if (!myId) throw new Error("ログインが必要です");
      const { error } = await supabase.from("blocks" as never).delete()
        .eq("blocker_id", myId).eq("blocked_id", targetUserId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ブロックを解除しました");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!myId || myId === targetUserId) return null;

  return (
    <div className="flex gap-2 flex-wrap">
      <Button variant="outline" size="sm" onClick={() => setReportOpen(true)}>
        <Flag className="w-3.5 h-3.5 mr-1" /> 通報する
      </Button>
      {alreadyBlocked ? (
        <Button variant="ghost" size="sm" onClick={() => unblock.mutate()} disabled={unblock.isPending}>
          ブロック解除
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setBlockOpen(true)}>
          <Ban className="w-3.5 h-3.5 mr-1" /> ブロックする
        </Button>
      )}

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{targetName ? `${targetName}さんを通報` : "このユーザーを通報"}</DialogTitle>
            <DialogDescription>
              通報内容は運営に送信され、24時間以内に確認・対応します。緊急の危険がある場合は警察等にもご相談ください。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <RadioGroup value={reason} onValueChange={setReason} className="space-y-2">
              {REPORT_REASONS.map((r) => (
                <label key={r.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value={r.value} id={`reason-${r.value}`} />
                  <span>{r.label}</span>
                </label>
              ))}
            </RadioGroup>
            <div>
              <Label htmlFor="report-details" className="text-xs">詳細（任意）</Label>
              <Textarea
                id="report-details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={4}
                maxLength={500}
                placeholder="状況を具体的にお書きください"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReportOpen(false)}>キャンセル</Button>
            <Button variant="destructive" onClick={() => report.mutate()} disabled={report.isPending}>
              通報を送信
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={blockOpen} onOpenChange={setBlockOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{targetName ? `${targetName}さんをブロックしますか？` : "このユーザーをブロックしますか？"}</AlertDialogTitle>
            <AlertDialogDescription>
              ブロックすると、この相手の依頼・案件があなたの一覧に表示されなくなります。ブロックしたことは相手に通知されません。運営にも記録され、必要に応じて対応します。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={() => block.mutate()} disabled={block.isPending}>
              ブロックする
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
