import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const registerSchema = z.object({
  token: z.string().min(20).max(4096),
  user_agent: z.string().max(500).optional(),
  platform: z.string().max(50).optional(),
});

export const registerDeviceToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => registerSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("device_tokens").upsert(
      {
        token: data.token,
        user_id: userId,
        user_agent: data.user_agent ?? null,
        platform: data.platform ?? "web",
        last_seen_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: "token" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const unregisterSchema = z.object({ token: z.string().min(20).max(4096) });

export const unregisterDeviceToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => unregisterSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("device_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token", data.token);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** テスト用：自分自身にプッシュを送る */
export const sendTestPushToSelf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { sendPushToUser } = await import("./fcm.server");
    const result = await sendPushToUser(context.userId, {
      title: "テスト通知",
      body: "ＮＡＲＡＢＯＵ のプッシュ通知が正常に届いています。",
      data: { url: "/dashboard", tag: "test" },
    });
    return result;
  });
