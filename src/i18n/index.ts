import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ja from "./ja.json";
import en from "./en.json";

function detectInitialLanguage(): "ja" | "en" {
  return "ja";
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: { ja: { translation: ja }, en: { translation: en } },
    lng: detectInitialLanguage(),
    fallbackLng: "ja",
    defaultNS: "translation",
    supportedLngs: ["ja", "en"],
    interpolation: { escapeValue: false },
    // synchronous init so isInitialized=true before first render (SSR + client)
    initAsync: false,
    react: { useSuspense: false },
  });
}

export default i18n;
