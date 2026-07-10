import { createFileRoute, useRouter, redirect, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: AuthPage,
});

function AuthPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) router.navigate({ to: "/dashboard" });
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        if (!agreed) {
          toast.error(t("auth.termsRequired"));
          setLoading(false);
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: {
              name,
              phone: phone.trim(),
              terms_accepted: "true",
            },
          },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success(t("auth.signupCheckEmail"), { duration: 8000 });
          setMode("login");
        } else {
          toast.success(t("auth.success"));
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success(t("auth.success"));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("auth.failed");
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md p-8">
          <h1 className="font-serif text-2xl mb-6">{t("auth.title")}</h1>
          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div>
                  <Label htmlFor="name">{t("auth.name")}</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={1} maxLength={60} />
                </div>
                <div>
                  <Label htmlFor="phone">{t("auth.phone")}</Label>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    minLength={10}
                    maxLength={20}
                    pattern="[0-9\-\+\(\)\s]{10,20}"
                    placeholder={t("auth.phonePlaceholder")}
                  />
                </div>
              </>
            )}
            <div>
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            {mode === "signup" && (
              <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                <Checkbox
                  checked={agreed}
                  onCheckedChange={(v) => setAgreed(v === true)}
                  className="mt-0.5"
                  required
                  aria-required="true"
                  aria-invalid={!agreed}
                />
                <span>
                  <span className="text-destructive mr-0.5" aria-hidden="true">*</span>
                  <Link to="/terms" className="underline hover:text-foreground">利用規約</Link>
                  と
                  <Link to="/privacy" className="underline hover:text-foreground">プライバシーポリシー</Link>
                  に同意します（必須）
                </span>
              </label>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={loading || (mode === "signup" && !agreed)}
            >
              {loading ? t("common.loading") : mode === "signup" ? t("auth.signup") : t("auth.login")}
            </Button>
          </form>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
              className="text-xs text-muted-foreground hover:text-foreground text-left"
            >
              {mode === "login" ? t("auth.switchSignup") : t("auth.switchLogin")}
            </button>
            {mode === "login" && (
              <Link to="/auth/forgot" className="text-xs text-muted-foreground hover:text-foreground">
                {t("auth.forgot")}
              </Link>
            )}
          </div>

        </Card>
      </main>
    </div>
  );
}

