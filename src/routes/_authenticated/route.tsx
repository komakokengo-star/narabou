import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // アカウント停止（BAN）ゲート: 運営が停止したユーザーはログアウトしてログイン画面へ
    const { data: profile } = await supabase
      .from("profiles")
      .select("suspended_at")
      .eq("id", data.user.id)
      .maybeSingle();
    if ((profile as { suspended_at?: string | null } | null)?.suspended_at) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
