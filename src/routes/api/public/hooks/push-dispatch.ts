import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * DB トリガー (net.http_post) から呼び出されるプッシュ通知ディスパッチャ。
 * apikey ヘッダで publishable/anon key を検証。
 *
 * Body:
 *   { event: string, match_id?: uuid, request_id?: uuid, user_id?: uuid,
 *     title?: string, body?: string, data?: Record<string,string> }
 */
const schema = z.object({
  event: z.string().min(1).max(64),
  match_id: z.string().uuid().optional(),
  request_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  title: z.string().max(200).optional(),
  body: z.string().max(500).optional(),
  data: z.record(z.string(), z.string()).optional(),
});

type Payload = z.infer<typeof schema>;

function fmtNo(n: number | null | undefined) {
  return n == null ? "----" : String(n).padStart(4, "0");
}

export const Route = createFileRoute("/api/public/hooks/push-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("apikey") ?? "";
        const allowed = [
          process.env.SUPABASE_SERVICE_ROLE_KEY,
          process.env.SUPABASE_PUBLISHABLE_KEY,
          process.env.SUPABASE_ANON_KEY,
        ].filter(Boolean) as string[];
        if (!provided || !allowed.includes(provided)) {
          return new Response("unauthorized", { status: 401 });
        }

        let payload: Payload;
        try {
          payload = schema.parse(await request.json());
        } catch (err) {
          return new Response(`bad request: ${(err as Error).message}`, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendPushToUser } = await import("@/lib/fcm.server");

        // イベントに応じて宛先ユーザーと本文を解決
        const targets: Array<{ userId: string; title: string; body: string; url: string; tag: string }> = [];

        if (payload.match_id) {
          const { data: match } = await supabaseAdmin
            .from("matches")
            .select("id,status,worker_id,request_id,requests(request_number,store_name,customer_id)")
            .eq("id", payload.match_id)
            .maybeSingle();
          const req = (match as any)?.requests;
          const no = fmtNo(req?.request_number);
          const store = req?.store_name ?? "依頼";
          const workerUrl = `/worker/job/${payload.match_id}`;
          const customerUrl = req?.id ? `/customer/request/${req.id}` : "/dashboard";

          if (match) {
            switch (payload.event) {
              case "match_created":
              case "match_pending":
                if (req?.customer_id) targets.push({
                  userId: req.customer_id,
                  title: `受注申請 #${no}`,
                  body: `${store} に代行者から受注申請が届きました`,
                  url: customerUrl,
                  tag: `match-${payload.match_id}`,
                });
                break;
              case "match_approved":
                targets.push({
                  userId: match.worker_id,
                  title: `マッチ成立 #${no}`,
                  body: `${store}: 依頼者が承認しました`,
                  url: workerUrl,
                  tag: `match-${payload.match_id}`,
                });
                break;
              case "match_rejected":
                targets.push({
                  userId: match.worker_id,
                  title: `受注申請が拒否されました #${no}`,
                  body: `${store}: 依頼者が申請を拒否しました`,
                  url: workerUrl,
                  tag: `match-${payload.match_id}`,
                });
                break;
              case "awaiting_confirmation":
                if (req?.customer_id) targets.push({
                  userId: req.customer_id,
                  title: `完了報告 #${no}`,
                  body: `${store}: 代行者から完了報告が届きました。ご確認ください。`,
                  url: customerUrl,
                  tag: `match-${payload.match_id}`,
                });
                break;
              case "completed":
                targets.push({
                  userId: match.worker_id,
                  title: `決済確定 #${no}`,
                  body: `${store}: 依頼が完了しました`,
                  url: workerUrl,
                  tag: `match-${payload.match_id}`,
                });
                break;
              case "force_completed":
                targets.push({
                  userId: match.worker_id,
                  title: `強制完了 #${no}`,
                  body: `${store}: 対応期限を超過したため強制完了(報酬¥0)になりました`,
                  url: workerUrl,
                  tag: `match-${payload.match_id}`,
                });
                break;
            }
          }
        } else if (payload.request_id) {
          const { data: req } = await supabaseAdmin
            .from("requests")
            .select("id,request_number,store_name,customer_id,status")
            .eq("id", payload.request_id)
            .maybeSingle();
          if (req) {
            const no = fmtNo(req.request_number);
            if (payload.event === "auto_canceled") {
              targets.push({
                userId: req.customer_id,
                title: `依頼を自動キャンセルしました #${no}`,
                body: `${req.store_name}: 希望日時を超過したため自動キャンセルされました`,
                url: "/customer",
                tag: `req-${req.id}`,
              });
            }
          }
        }

        // 明示的な user_id + title/body 指定 (汎用パス)
        if (payload.user_id && payload.title && payload.body) {
          targets.push({
            userId: payload.user_id,
            title: payload.title,
            body: payload.body,
            url: payload.data?.url ?? "/dashboard",
            tag: payload.data?.tag ?? payload.event,
          });
        }

        const results = await Promise.all(
          targets.map((t) =>
            sendPushToUser(t.userId, {
              title: t.title,
              body: t.body,
              data: { url: t.url, tag: t.tag, event: payload.event, ...(payload.data ?? {}) },
            }).catch((e) => ({ sent: 0, failed: 0, revoked: 0, error: String(e) })),
          ),
        );

        return new Response(
          JSON.stringify({ ok: true, dispatched: targets.length, results }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
