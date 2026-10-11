// LINEヤフー広告（Yahoo!広告）コンバージョン計測。
// サイトジェネラルタグ（ytag.js）を必要になった時点で遅延読み込みし、
// 依頼の決済完了時に fireYahooConversion() でコンバージョンを送信する。

const YTAG_URL = "https://s.yimg.jp/images/listing/tool/cv/ytag.js";
const CONV_IO = "66EM_Nxh6HgDev0IGLZ8jw..";
const CONV_LABEL = "WIPBFZV8EDLK2T8PWF1370765";

declare global {
  interface Window {
    ytag?: (config: Record<string, unknown>) => void;
  }
}

let loading: Promise<void> | null = null;

function loadYtag(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.ytag) return Promise.resolve();
  if (!loading) {
    loading = new Promise<void>((resolve) => {
      const script = document.createElement("script");
      script.async = true;
      script.src = YTAG_URL;
      script.onload = () => resolve();
      // 広告ブロッカー等で読み込めない場合は計測を諦める（アプリ動作には影響させない）
      script.onerror = () => resolve();
      document.head.appendChild(script);
    });
  }
  return loading;
}

/**
 * コンバージョンを送信する。
 * @param value 実際の依頼金額（円）
 * @param transactionId 重複計測防止用のID（PaymentIntent ID など）
 */
export async function fireYahooConversion(value: number, transactionId?: string) {
  try {
    await loadYtag();
    if (!window.ytag) return;
    window.ytag({
      type: "yjad_conversion",
      config: {
        yahoo_ydn_conv_io: CONV_IO,
        yahoo_ydn_conv_label: CONV_LABEL,
        yahoo_ydn_conv_transaction_id: transactionId ?? "",
        yahoo_ydn_conv_value: String(Math.round(value)),
        yahoo_email: "",
        yahoo_phone_number: "",
      },
    });
  } catch {
    // 計測失敗は無視
  }
}
