import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/noto-sans-jp/500.css";
import "@fontsource/noto-sans-jp/700.css";
import "@fontsource/noto-serif-jp/600.css";
import "@fontsource/noto-serif-jp/700.css";
import "@fontsource/noto-sans-kr/400.css";
import "@fontsource/noto-sans-kr/500.css";
import "@fontsource/noto-sans-kr/700.css";
import "@fontsource/noto-sans-tc/400.css";
import "@fontsource/noto-sans-tc/500.css";
import "@fontsource/noto-sans-tc/700.css";
import "@fontsource/noto-serif-tc/600.css";
import "@fontsource/noto-serif-tc/700.css";

import appI18n from "../i18n";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";

const recoveryRedirectScript = `
(function () {
  try {
    var params = new URLSearchParams(window.location.search);
    if (window.location.hash && window.location.hash.length > 1) {
      new URLSearchParams(window.location.hash.slice(1)).forEach(function (value, key) {
        if (!params.has(key)) params.set(key, value);
      });
    }
    var isRecovery = params.get("type") === "recovery" || params.get("redirect_type") === "recovery";
    var hasResetToken = params.has("access_token") || params.has("refresh_token") || params.has("token_hash") || params.has("token");
    // Recovery links from emails may land on any path (especially when the redirect URL
    // falls back to the Site URL root). Always forward them to the dedicated reset page.
    if (window.location.pathname !== "/auth/reset" && isRecovery && hasResetToken) {
      window.location.replace("/auth/reset" + window.location.search + window.location.hash);
    }
  } catch (_) {}
})();
`;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <p className="mt-4 text-sm text-muted-foreground">ページが見つかりません</p>
        <a href="/" className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          ホームへ
        </a>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">エラーが発生しました</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          再試行
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#c0392b" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "NARABOU" },
      { name: "mobile-web-app-capable", content: "yes" },
      { title: "福岡行列代行 — 博多・天神の行列、並ぶのは私たち" },
      { name: "description", content: "基本800円+10分200円。ピーク時は+300円。決済・追加課金・返金もアプリで完結。" },
      { property: "og:title", content: "福岡行列代行 — 博多・天神の行列、並ぶのは私たち" },
      { property: "og:description", content: "基本800円+10分200円。ピーク時は+300円。決済・追加課金・返金もアプリで完結。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "福岡行列代行 — 博多・天神の行列、並ぶのは私たち" },
      { name: "twitter:description", content: "基本800円+10分200円。ピーク時は+300円。決済・追加課金・返金もアプリで完結。" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1514279e-988c-4d3e-8dfe-afab2bacef0a/id-preview-727c5693--bc84fda8-23a4-4dfd-8a53-fea4e73274e7.lovable.app-1783149629848.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1514279e-988c-4d3e-8dfe-afab2bacef0a/id-preview-727c5693--bc84fda8-23a4-4dfd-8a53-fea4e73274e7.lovable.app-1783149629848.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang={appI18n.language}>
      <head><HeadContent /></head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: recoveryRedirectScript }} />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const clearSbStorage = () => {
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith("sb-"))
          .forEach((k) => localStorage.removeItem(k));
      } catch (_) {}
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        router.navigate({ to: "/auth/reset" });
      }
      if (event === "SIGNED_OUT") {
        clearSbStorage();
      }
    });

    // Validate the stored session on load. If the JWT references a deleted
    // or invalid user (e.g. 403 user_not_found), force sign-out so the app
    // stops looping on /auth/v1/user and returns to the login screen.
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) return;
        const { error } = await supabase.auth.getUser();
        if (!error) return;
        await supabase.auth.signOut().catch(() => {});
        clearSbStorage();
        if (typeof window !== "undefined" && window.location.pathname !== "/auth") {
          window.location.replace("/auth");
        }
      } catch (_) {}
    })();

    return () => sub.subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    const updateLang = () => {
      document.documentElement.lang = appI18n.language;
    };
    updateLang();
    appI18n.on("languageChanged", updateLang);
    return () => {
      appI18n.off("languageChanged", updateLang);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={appI18n}>
        <Outlet />
        <Toaster richColors position="top-center" />
      </I18nextProvider>
    </QueryClientProvider>
  );
}
