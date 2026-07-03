import { useEffect, useMemo, useState } from "react";
import { loadConnectAndInitialize } from "@stripe/connect-js";
import {
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
} from "@stripe/react-connect-js";
import { getStripePublishableKey } from "@/lib/stripe-config.functions";
import { createConnectAccountSession } from "@/lib/stripe-connect.functions";

type Props = {
  onExit: () => void;
  onError?: (message: string) => void;
};

export function StripeEmbeddedOnboarding({ onExit, onError }: Props) {
  const [instance, setInstance] = useState<Awaited<ReturnType<typeof loadConnectAndInitialize>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { key } = await getStripePublishableKey();
        if (!key) throw new Error("公開キーが設定されていません。");
        const inst = loadConnectAndInitialize({
          publishableKey: key,
          fetchClientSecret: async () => {
            const r = await createConnectAccountSession();
            if (r.error || !r.clientSecret) throw new Error(r.error ?? "セッション作成に失敗しました");
            return r.clientSecret;
          },
          appearance: { overlays: "dialog", variables: { colorPrimary: "#0f172a" } },
        });
        if (!cancelled) setInstance(inst);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "初期化に失敗しました";
        if (!cancelled) {
          setError(msg);
          onError?.(msg);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [onError]);

  const provider = useMemo(() => instance, [instance]);

  if (error) return <div className="text-sm text-destructive">{error}</div>;
  if (!provider) return <div className="text-sm text-muted-foreground">読み込み中…</div>;

  return (
    <ConnectComponentsProvider connectInstance={provider}>
      <ConnectAccountOnboarding onExit={onExit} />
    </ConnectComponentsProvider>
  );
}
