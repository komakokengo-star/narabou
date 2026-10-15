import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { requestFcmToken, subscribeForegroundMessages } from "@/lib/firebase";
import { registerDeviceToken } from "@/lib/push.functions";

type PermState = "unsupported" | "default" | "granted" | "denied";

// Native app (iOS/Android) with the FirebaseMessaging plugin built in.
// Older app builds without the plugin fall back to "unsupported".
function nativePushAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("FirebaseMessaging");
}

async function nativeMessaging() {
  const mod = await import("@capacitor-firebase/messaging");
  return mod.FirebaseMessaging;
}

function mapNative(p: string): PermState {
  if (p === "granted") return "granted";
  if (p === "denied") return "denied";
  return "default";
}

// ネイティブの getToken() は Firebase 初期化漏れなどで永久に解決しない
// ことがあるため、必ずタイムアウトで打ち切る。
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} が時間内に完了しませんでした`)), ms),
    ),
  ]);
}

async function getTokenAny(ask: boolean): Promise<{ token: string | null; perm: PermState; platform: string }> {
  if (nativePushAvailable()) {
    const fm = await nativeMessaging();
    let { receive } = await fm.checkPermissions();
    if (ask && receive !== "granted" && receive !== "denied") {
      receive = (await fm.requestPermissions()).receive;
    }
    const perm = mapNative(receive);
    if (perm !== "granted") return { token: null, perm, platform: Capacitor.getPlatform() };
    const { token } = await withTimeout(fm.getToken(), 20000, "通知トークンの取得");
    return { token: token ?? null, perm, platform: Capacitor.getPlatform() };
  }
  const token = await withTimeout(requestFcmToken(), 20000, "通知トークンの取得");
  return { token, perm: Notification.permission as PermState, platform: "web" };
}

export function usePushRegistration(enabled: boolean) {
  const [permission, setPermission] = useState<PermState>("default");
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (nativePushAvailable()) {
      nativeMessaging()
        .then((fm) => fm.checkPermissions())
        .then((r) => setPermission(mapNative(r.receive)))
        .catch(() => setPermission("unsupported"));
      return;
    }
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
    const native = nativePushAvailable();
    (async () => {
      try {
        const { token, platform } = await getTokenAny(false);
        if (!token || cancelled) return;
        await registerDeviceToken({
          data: { token, user_agent: navigator.userAgent.slice(0, 500), platform },
        });
      } catch (err) {
        console.warn("[push] register failed", err);
      }
    })();
    let unsub: (() => void) | undefined;
    if (native) {
      nativeMessaging()
        .then((fm) =>
          fm.addListener("notificationReceived", (e) => {
            const n = e.notification;
            if (n?.title) toast(n.title, { description: n.body });
          }),
        )
        .then((h) => {
          if (cancelled) h.remove();
          else unsub = () => h.remove();
        })
        .catch(() => {});
      nativeMessaging()
        .then((fm) =>
          fm.addListener("notificationActionPerformed", (e) => {
            const url = (e.notification?.data as Record<string, string> | undefined)?.url;
            if (url && url.startsWith("/")) window.location.assign(url);
          }),
        )
        .catch(() => {});
    } else {
      const unsubP = subscribeForegroundMessages(({ title, body }) => {
        if (title) toast(title, { description: body });
      });
      unsub = () => unsubP.then((fn) => fn?.()).catch(() => {});
    }
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [enabled, permission]);

  const requestPermission = async () => {
    if (permission === "unsupported") {
      toast.error("このブラウザは通知に対応していません");
      return;
    }
    setRegistering(true);
    try {
      // 許可ダイアログ・プラグイン呼び出しのどこで止まっても必ず抜けるよう全体にも上限を設ける
      const { token, perm, platform } = await withTimeout(getTokenAny(true), 45000, "通知の設定");
      setPermission(perm);
      if (!token) {
        if (perm === "denied") toast.error("通知が拒否されています。端末の設定から許可してください。");
        return;
      }
      await withTimeout(
        registerDeviceToken({
          data: { token, user_agent: navigator.userAgent.slice(0, 500), platform },
        }),
        15000,
        "通知の登録",
      );
      toast.success("プッシュ通知を有効にしました");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "通知の登録に失敗しました");
    } finally {
      setRegistering(false);
    }
  };

  return { permission, registering, requestPermission };
}
