// LINEヤフー広告（Yahoo!広告）コンバージョン計測。
// ytag.js は window.ytag を定義せず、window.yjDataLayer キューを監視する形で動く。
// そのため公式スニペットと同じ way で ytag() スタブを先に定義し、
// 決済完了・受注申請のタイミングでコンバージョンを送信する。

const YTAG_URL = "https://s.yimg.jp/images/listing/tool/cv/ytag.js";
const CONV_IO = "66EM_Nxh6HgDev0IGLZ8jw..";
const CONV_LABEL = "WIPBFZV8EDLK2T8PWF1370765";
// 代行者側（受注申請）のコンバージョン
const WORKER_CONV_IO = "XoSG74-mcb8574iELZvang..";
const WORKER_CONV_LABEL = "NIGCMJSRQPM0B751D91370885";

declare global {
  interface Window {
    yjDataLayer?: unknown[];
    ytag?: (...args: unknown[]) => void;
  }
}

// ytag.js が読み込まれる前にキューと ytag() を用意しておく（公式の形）。
// ytag.js は読み込み時に既存のキューを処理し、以降の push を即座に反映する。
function ensureYtagStub() {
  if (typeof window === "undefined") return;
  if (!window.yjDataLayer) window.yjDataLayer = [];
  if (typeof window.ytag !== "function") {
    window.ytag = function ytag(...args: unknown[]) {
      if (window.yjDataLayer) window.yjDataLayer.push(args);
    };
  }
}

let loading: Promise<void> | null = null;

function loadYtag(): Promise<void> {
  ensureYtagStub();
  if (typeof window === "undefined") return Promise.resolve();
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
 * @param io タグ発行時に割り当てられる計測ID
 * @param label コンバージョンラベル
 * @param value 金額（円）
 * @param transactionId 重複計測防止用のID（PaymentIntent ID など）
 */
async function fireConversion(io: string, label: string, value: number, transactionId?: string) {
  try {
    await loadYtag();
    if (typeof window === "undefined" || typeof window.ytag !== "function") return;
    window.ytag({
      type: "yjad_conversion",
      config: {
        yahoo_ydn_conv_io: io,
        yahoo_ydn_conv_label: label,
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

/**
 * 依頼者側コンバージョン（決済完了時）を送信する。
 * @param value 実際の依頼金額（円）
 * @param transactionId 重複計測防止用のID（PaymentIntent ID など）
 */
export function fireYahooConversion(value: number, transactionId?: string) {
  return fireConversion(CONV_IO, CONV_LABEL, value, transactionId);
}

/**
 * 代行者側コンバージョン（受注申請の送信時）を送信する。
 * 金額はタグ発行時の登録値（2000円）を使う。
 * @param transactionId 重複計測防止用のID（申請した案件ID など）
 */
export function fireYahooWorkerConversion(transactionId?: string) {
  return fireConversion(WORKER_CONV_IO, WORKER_CONV_LABEL, 2000, transactionId);
}
