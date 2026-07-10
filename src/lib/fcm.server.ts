// Server-only helper: send FCM HTTP v1 messages using the service account JSON.
// Uses Web Crypto (SubtleCrypto) so it runs on Cloudflare Workers.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

let cachedToken: { token: string; expiresAt: number } | null = null;

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.token;

  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claim))}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)),
  );
  const jwt = `${unsigned}.${base64UrlEncode(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${encodeURIComponent(jwt)}`,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`FCM OAuth failed: ${res.status} ${txt}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, expiresAt: now + json.expires_in };
  return json.access_token;
}

function loadServiceAccount(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON not configured");
  const sa = JSON.parse(raw) as ServiceAccount;
  if (!sa.client_email || !sa.private_key) throw new Error("Invalid service account JSON");
  return sa;
}

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

async function sendToToken(
  projectId: string,
  accessToken: string,
  token: string,
  payload: PushPayload,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: payload.title, body: payload.body },
          data: payload.data ?? {},
          webpush: {
            fcm_options: { link: payload.data?.url ?? "/dashboard" },
          },
        },
      }),
    },
  );
  if (res.ok) return { ok: true, status: res.status };
  const txt = await res.text();
  return { ok: false, status: res.status, error: txt };
}

/** ユーザーの全 (未失効) デバイストークンにプッシュ通知を送る */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number; revoked: number }> {
  const { data: tokens, error } = await (supabaseAdmin as any)
    .from("device_tokens")
    .select("token")
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
  if (!tokens || tokens.length === 0) return { sent: 0, failed: 0, revoked: 0 };

  const sa = loadServiceAccount();
  const projectId = process.env.FIREBASE_PROJECT_ID || sa.project_id || "narabou-push";
  const accessToken = await getAccessToken(sa);

  let sent = 0;
  let failed = 0;
  let revoked = 0;
  const toRevoke: string[] = [];

  await Promise.all(
    (tokens as Array<{ token: string }>).map(async ({ token }) => {
      const r = await sendToToken(projectId, accessToken, token, payload);
      if (r.ok) {
        sent++;
      } else {
        failed++;
        if (r.status === 404 || r.status === 400) {
          toRevoke.push(token);
        }
      }
    }),
  );

  if (toRevoke.length > 0) {
    await (supabaseAdmin as any)
      .from("device_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .in("token", toRevoke);
    revoked = toRevoke.length;
  }

  return { sent, failed, revoked };
}
