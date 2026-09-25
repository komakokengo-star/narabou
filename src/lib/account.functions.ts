import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FINAL = ["completed", "canceled"];

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const [{ data: reqs }, { data: mts }] = await Promise.all([
      supabaseAdmin.from("requests").select("id,status").eq("customer_id", userId),
      supabaseAdmin.from("matches").select("id,status").eq("worker_id", userId),
    ]);
    const active =
      (reqs ?? []).some((r: any) => !FINAL.includes(r.status)) ||
      (mts ?? []).some((m: any) => !FINAL.includes(m.status));
    if (active) {
      return { ok: false as const, reason: "active" as const };
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) {
      console.error("deleteUser failed", error);
      return { ok: false as const, reason: "error" as const };
    }
    return { ok: true as const };
  });
