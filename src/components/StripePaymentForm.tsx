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

let stripePromise: Promise<Stripe | null> | null = null;
function getStripePromise() {
  if (!stripePromise) {
    stripePromise = getStripePublishableKey().then(({ key }) =>
      key ? loadStripe(key) : Promise.resolve(null),
    );
  }
  return stripePromise;
}

export function StripePaymentForm({
  clientSecret,
  amount,
  onSuccess,
  mode = "pay",
}: {
  clientSecret: string;
  amount: number;
  onSuccess?: () => void;
  mode?: "pay" | "authorize";
}) {
  const { data: stripeInstance } = useQuery({
    queryKey: ["stripe-instance"],
    queryFn: () => getStripePromise(),
    staleTime: Infinity,
  });
  const options = useMemo(() => ({ clientSecret, appearance: { theme: "stripe" as const } }), [clientSecret]);
  if (!stripeInstance) return <div className="text-sm text-muted-foreground">Stripe を読み込み中…</div>;
  return (
    <Elements stripe={stripeInstance} options={options}>
      <InnerForm amount={amount} onSuccess={onSuccess} mode={mode} />
    </Elements>
  );
}

function InnerForm({ amount, onSuccess, mode }: { amount: number; onSuccess?: () => void; mode: "pay" | "authorize" }) {
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
        redirect: "if_required",
      });
      if (error) {
        toast.error(error.message ?? "決済に失敗しました");
        return;
      }

      const result = await syncPaymentIntentStatus({ data: { clientSecret: clientSecretFromElements(elements) } });
      if (result.status !== "authorized" && result.status !== "paid") {
        toast.error("カードの仮押さえを確認できませんでした。カード情報を確認して再度お試しください。");
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
      <PaymentElement />
      <Button type="submit" className="w-full" disabled={!stripe || loading}>
        {loading ? t("common.loading") : t(mode === "authorize" ? "payment.authorize" : "payment.pay", { amount: formatYen(amount) })}
      </Button>
      {mode === "authorize" && (
        <p className="text-[11px] text-muted-foreground text-center">
          依頼完了報告を承認するまでは決済されません
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
