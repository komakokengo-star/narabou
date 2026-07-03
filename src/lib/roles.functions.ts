import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ベータ運用: 認証済みユーザーが自身にworkerロールを付与できるサーバー関数。
// クライアント直INSERTはRLSで禁止（権限昇格防止）。adminロールはここでは付与不可。
export const selfGrantWorkerRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "worker" });
    // 既存(重複)は成功扱い
    if (error && !/duplicate key|unique/i.test(error.message)) {
      throw new Error(error.message);
    }
    return { ok: true };
  });
