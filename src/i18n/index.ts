import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ja from "./ja.json";
import en from "./en.json";

function detectInitialLanguage(): "ja" | "en" {
  if (typeof window === "undefined") return "ja";
  try {
    const stored = window.localStorage.getItem("i18nextLng");
    if (stored === "ja" || stored === "en") return stored;
  } catch {
    // ignore
  }
  const nav = window.navigator?.language ?? "ja";
  return nav.toLowerCase().startsWith("en") ? "en" : "ja";
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: { ja: { translation: ja }, en: { translation: en } },
    lng: detectInitialLanguage(),
    fallbackLng: "ja",
    supportedLngs: ["ja", "en"],
    interpolation: { escapeValue: false },
    // synchronous init so isInitialized=true before first render (SSR + client)
    initAsync: false,
    react: { useSuspense: false },
  });
}

export default i18n;
