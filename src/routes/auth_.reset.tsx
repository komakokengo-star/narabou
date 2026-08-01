import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth_/reset")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "新しいパスワードの設定 — ＮＡＲＡＢＯＵ" },
      { name: "description", content: "メールのリンクから開いたＮＡＲＡＢＯＵのパスワード再設定ページです。新しいパスワードを入力して、アカウントへのアクセスを回復してください。" },
      { property: "og:title", content: "新しいパスワードの設定 — ＮＡＲＡＢＯＵ" },
      { property: "og:description", content: "新しいパスワードを設定してアカウントへのアクセスを回復します。" },
      { property: "og:url", content: "https://app.narabou.jp/auth/reset" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://app.narabou.jp/auth/reset" }],
  }),
  component: ResetPage,
});


function ResetPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    let mounted = true;
    const params = new URLSearchParams(window.location.search);
    if (window.location.hash && window.location.hash.length > 1) {
      new URLSearchParams(window.location.hash.slice(1)).forEach((value, key) => {
        if (!params.has(key)) params.set(key, value);
      });
    }
    const tokenHash = params.get("token_hash") ?? params.get("token");
    const isRecovery = params.get("type") === "recovery" || params.get("redirect_type") === "recovery";

    // Supabase auto-parses the recovery link hash and fires PASSWORD_RECOVERY event.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      if (data.session) {
        setReady(true);
      } else if (isRecovery && tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
        if (!mounted) return;
        if (error) {
          setInvalid(true);
        } else {
          window.history.replaceState(window.history.state, "", "/auth/reset");
          setReady(true);
        }
      }
      else {
        // Give the client a beat to parse the URL fragment; if still no session, link is invalid.
        setTimeout(() => {
          supabase.auth.getSession().then(({ data: d2 }) => {
            if (!mounted) return;
            if (!d2.session) setInvalid(true);
          });
        }, 800);
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success(t("auth.passwordUpdated"));
      await supabase.auth.signOut();
      router.navigate({ to: "/auth" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md p-8">
          <h1 className="font-serif text-2xl mb-6">{t("auth.resetTitle")}</h1>
          {invalid ? (
            <p className="text-sm text-destructive mb-4">{t("auth.resetLinkInvalid")}</p>
          ) : !ready ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="password">{t("auth.newPassword")}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("common.loading") : t("auth.updatePassword")}
              </Button>
            </form>
          )}
          <Link to="/auth" className="mt-4 inline-block text-xs text-muted-foreground hover:text-foreground">
            ← {t("auth.backToLogin")}
          </Link>
        </Card>
      </main>
    </div>
  );
}
