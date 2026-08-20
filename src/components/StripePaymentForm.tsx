import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { getStripePublishableKey } from "@/lib/stripe-config.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { formatYen } from "@/lib/fees";
import { syncPaymentIntentStatus } from "@/lib/payment-status.functions";

let stripePromise: Promise<{ stripe: Stripe | null; error: string | null }> | null = null;
function getStripePromise() {
  if (!stripePromise) {
    stripePromise = getStripePublishableKey()
      .then(async ({ key, error }) => {
        if (!key) return { stripe: null, error: error ?? "missing" };
        try {
          const stripe = await loadStripe(key);
          return { stripe, error: stripe ? null : "load_failed" };
        } catch {
          return { stripe: null, error: "load_failed" };
        }
      })
      .catch(() => ({ stripe: null, error: "load_failed" }));
  }
  return stripePromise;
}

const KEY_ERROR_MESSAGES: Record<string, string> = {
  missing: "決済の設定が未完了です（公開キー未設定）。運営にお問い合わせください。",
  incomplete: "決済の設定に不備があります（公開キーが不完全）。運営にお問い合わせください。",
  mode_mismatch: "決済の設定に不備があります（本番/テストキーの不一致）。運営にお問い合わせください。",
  load_failed: "決済フォームを読み込めませんでした。通信環境を確認して再読み込みしてください。",
};

export function StripePaymentForm({
  clientSecret,
  amount,
  onSuccess,
  mode = "pay",
  method = "card",
}: {
  clientSecret: string;
  amount: number;
  onSuccess?: () => void;
  mode?: "pay" | "authorize";
  method?: "card" | "paypay";
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["stripe-instance"],
    queryFn: () => getStripePromise(),
    staleTime: Infinity,
  });

  // PayPay など外部リダイレクト決済から戻ってきた場合、状態をサーバーで確定させる。
  const synced = useRef(false);
  useEffect(() => {
    if (synced.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const returned = params.get("payment_intent_client_secret");
    if (!returned) return;
    synced.current = true;
    syncPaymentIntentStatus({ data: { clientSecret: returned } })
      .then((result) => {
        if (result.status === "paid" || result.status === "authorized") {
          toast.success("お支払いが完了しました");
          onSuccess?.();
        }
      })
      .catch(() => undefined)
      .finally(() => {
        params.delete("payment_intent_client_secret");
        params.delete("payment_intent");
        params.delete("redirect_status");
        const q = params.toString();
        window.history.replaceState({}, "", window.location.pathname + (q ? `?${q}` : ""));
      });
  }, [onSuccess]);

  const options = useMemo(() => ({ clientSecret, appearance: { theme: "stripe" as const } }), [clientSecret]);
  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Stripe を読み込み中…</div>;
  if (!data.stripe) {
    return (
      <div className="text-sm rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">
        {KEY_ERROR_MESSAGES[data.error ?? "load_failed"] ?? KEY_ERROR_MESSAGES.load_failed}
      </div>
    );
  }
  return (
    <Elements key={clientSecret} stripe={data.stripe} options={options}>
      <InnerForm clientSecret={clientSecret} amount={amount} onSuccess={onSuccess} mode={mode} method={method} />
    </Elements>
  );
}


function InnerForm({ clientSecret, amount, onSuccess, mode, method }: { clientSecret: string; amount: number; onSuccess?: () => void; mode: "pay" | "authorize"; method: "card" | "paypay" }) {
  const stripe = useStripe();
  const elements = useElements();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: window.location.href },
        // PayPay は外部サイトへの遷移が必須のため常にリダイレクトを許可する
        redirect: method === "paypay" ? "always" : "if_required",
      });
      if (error) {
        toast.error(error.message ?? "決済に失敗しました");
        return;
      }

      const result = await syncPaymentIntentStatus({ data: { clientSecret } });
      if (result.status !== "authorized" && result.status !== "paid") {
        toast.error(
          method === "paypay"
            ? "PayPay の決済を確認できませんでした。もう一度お試しください。"
            : "カードの仮押さえを確認できませんでした。カード情報を確認して再度お試しください。",
        );
        return;
      }
      toast.success(result.status === "authorized" ? "仮押さえが完了しました" : "お支払いが完了しました");
      onSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "決済状態の確認に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <PaymentElement
        options={{
          layout: { type: "accordion", defaultCollapsed: false },
          wallets: { applePay: "auto", googlePay: "auto" },
        }}
      />
      <Button type="submit" className="w-full" disabled={!stripe || loading}>
        {loading ? t("common.loading") : t(mode === "authorize" ? "payment.authorize" : "payment.pay", { amount: formatYen(amount) })}
      </Button>
      {mode === "authorize" && method === "card" && (
        <p className="text-[11px] text-muted-foreground text-center">
          依頼完了報告を承認するまでは決済されません
        </p>
      )}
      {method === "paypay" && (
        <p className="text-[11px] text-muted-foreground text-center">
          PayPay は即時決済です。依頼が完了しなかった場合は、キャンセルポリシーに基づく手数料を差し引いた金額を後日返金します。
        </p>
      )}
      <p className="text-[10px] text-muted-foreground">{t("payment.testMode")}</p>
    </form>
  );
}

// Trigger preload once
export function usePreloadStripe() {
  useEffect(() => { getStripePromise(); }, []);
}
