import { Bell, BellOff, BellRing } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePushRegistration } from "@/hooks/usePushRegistration";
import { sendTestPushToSelf } from "@/lib/push.functions";
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";

function detectIosBrowserTab(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!ios) return false;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return !standalone && !Capacitor.isNativePlatform();
}

export function PushNotificationCard() {
  const { permission, registering, requestPermission } = usePushRegistration(true);
  const [testing, setTesting] = useState(false);
  const [iosTab, setIosTab] = useState(false);
  useEffect(() => {
    setIosTab(detectIosBrowserTab());
  }, []);

  const sendTest = async () => {
    setTesting(true);
    try {
      const r = await sendTestPushToSelf();
      if (r.sent > 0) toast.success(`テスト通知を送信しました (${r.sent}件)`);
      else toast.error("送信先デバイスがありません");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "送信失敗");
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
          {permission === "granted" ? <BellRing className="w-5 h-5" /> :
           permission === "denied" ? <BellOff className="w-5 h-5" /> :
           <Bell className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold">プッシュ通知</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {permission === "granted" && "有効になっています。受注申請・マッチ成立・完了報告などをお知らせします。"}
            {permission === "default" && "受注・完了などの重要な更新を通知で受け取れます。"}
            {permission === "denied" && "通知がブロックされています。ブラウザ設定から許可してください。"}
            {permission === "unsupported" &&
              (iosTab
                ? "iPhone/iPadのSafariでは通知を受け取れません。App Storeの「NARABOU」アプリでご利用ください。"
                : "このブラウザ/デバイスは通知に対応していません。")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {permission !== "granted" && permission !== "unsupported" && (
              <Button size="sm" onClick={requestPermission} disabled={registering}>
                {registering ? "設定中..." : "通知を有効にする"}
              </Button>
            )}
            {permission === "granted" && (
              <Button size="sm" variant="outline" onClick={sendTest} disabled={testing}>
                {testing ? "送信中..." : "テスト送信"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
