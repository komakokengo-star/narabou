import { createFileRoute, useRouter, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { name },
          },
        });
        if (error) throw error;
        toast.success(t("auth.success"));
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
              <div>
                <Label htmlFor="name">{t("auth.name")}</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={1} maxLength={60} />
              </div>
            )}
            <div>
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("common.loading") : mode === "signup" ? t("auth.signup") : t("auth.login")}
            </Button>
          </form>
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="mt-4 text-xs text-muted-foreground hover:text-foreground"
          >
            {mode === "login" ? t("auth.switchSignup") : t("auth.switchLogin")}
          </button>
        </Card>
      </main>
    </div>
  );
}
