import { useEffect, useState } from "react";
import { toast } from "sonner";
import { requestFcmToken, subscribeForegroundMessages } from "@/lib/firebase";
import { registerDeviceToken } from "@/lib/push.functions";

type PermState = "unsupported" | "default" | "granted" | "denied";

export function usePushRegistration(enabled: boolean) {
  const [permission, setPermission] = useState<PermState>("default");
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as PermState);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (permission !== "granted") return;
    let cancelled = false;
    (async () => {
      try {
        const token = await requestFcmToken();
        if (!token || cancelled) return;
        await registerDeviceToken({
          data: {
            token,
            user_agent: navigator.userAgent.slice(0, 500),
            platform: "web",
          },
        });
      } catch (err) {
        console.warn("[push] register failed", err);
      }
    })();
    const unsubP = subscribeForegroundMessages(({ title, body }) => {
      if (title) toast(title, { description: body });
    });
    return () => {
      cancelled = true;
      unsubP.then((fn) => fn?.()).catch(() => {});
    };
  }, [enabled, permission]);

  const requestPermission = async () => {
    if (permission === "unsupported") {
      toast.error("このブラウザは通知に対応していません");
      return;
    }
    setRegistering(true);
    try {
      const token = await requestFcmToken();
      const perm = Notification.permission as PermState;
      setPermission(perm);
      if (!token) {
        if (perm === "denied") toast.error("通知が拒否されています。ブラウザ設定から許可してください。");
        return;
      }
      await registerDeviceToken({
        data: {
          token,
          user_agent: navigator.userAgent.slice(0, 500),
          platform: "web",
        },
      });
      toast.success("プッシュ通知を有効にしました");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "通知の登録に失敗しました");
    } finally {
      setRegistering(false);
    }
  };

  return { permission, registering, requestPermission };
}
