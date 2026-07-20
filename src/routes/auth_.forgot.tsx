import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth_/forgot")({
  ssr: false,
  component: ForgotPage,
});

function ForgotPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Supabase の許可リストに登録された Site URL (公開URL) を使う。
      // プレビューURLを渡すと許可リスト外で / にフォールバックされ、
      // メールリンクが「プロキシエラー 404」または TOP に飛ぶ原因になる。
      const resetOrigin = typeof window !== "undefined" ? window.location.origin : "https://narabou.lovable.app";
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${resetOrigin}/auth/reset`,
      });
      if (error) throw error;
      setSent(true);
      toast.success(t("auth.resetEmailSent"));
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
          <h1 className="font-serif text-2xl mb-2">{t("auth.resetTitle")}</h1>
          <p className="text-sm text-muted-foreground mb-6">{t("auth.resetDesc")}</p>
          {sent ? (
            <p className="text-sm mb-4">{t("auth.resetEmailSent")}</p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("common.loading") : t("auth.sendResetLink")}
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
