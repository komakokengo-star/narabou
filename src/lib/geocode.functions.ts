import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

function checkGatewayCreds() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gmKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!lovableKey || !gmKey) throw new Error("Google Maps 接続が未設定です");
  return { lovableKey, gmKey };
}

async function handleGatewayError(res: Response) {
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as any;
    const reason = body?.error?.details?.find((d: any) => d.reason)?.reason;
    if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") {
      throw new Error(
        'Google Maps server key is referrer-restricted. In Google Cloud Console, set the server key\'s application restrictions to "None" or "IP addresses".'
      );
    }
    if (reason === "API_KEY_SERVICE_BLOCKED") {
      throw new Error(
        "Google Maps server key does not allow this API. In Google Cloud Console, add this Maps API to the server key's allowed-APIs list."
      );
    }
    throw new Error("Google Maps request was denied (403). Check the server key's restrictions in Google Cloud Console.");
  }
  if (!res.ok) {
    const body = await res.text();
    console.error("geocode failed", res.status, body);
    throw new Error(`住所検索に失敗しました (${res.status})`);
  }
}

export const reverseGeocode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { lat: number; lng: number }) => {
    if (typeof d.lat !== "number" || typeof d.lng !== "number") throw new Error("invalid coords");
    if (d.lat < -90 || d.lat > 90 || d.lng < -180 || d.lng > 180) throw new Error("invalid coords");
    return d;
  })
  .handler(async ({ data }) => {
    const { lovableKey, gmKey } = checkGatewayCreds();
    const url = `${GATEWAY_URL}/maps/api/geocode/json?latlng=${data.lat},${data.lng}&language=ja`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmKey,
      },
    });
    await handleGatewayError(res);
    const json = (await res.json()) as {
      status: string;
      results?: { formatted_address: string }[];
    };
    if (json.status !== "OK" || !json.results?.length) {
      return { address: null as string | null };
    }
    return { address: json.results[0].formatted_address };
  });

export const forwardGeocode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { address: string }) => {
    if (typeof d.address !== "string" || !d.address.trim()) throw new Error("invalid address");
    return { address: d.address.trim().slice(0, 300) };
  })
  .handler(async ({ data }) => {
    const { lovableKey, gmKey } = checkGatewayCreds();
    const q = `address=${encodeURIComponent(data.address)}&language=ja&region=jp`;
    const url = `${GATEWAY_URL}/maps/api/geocode/json?${q}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmKey,
      },
    });
    await handleGatewayError(res);
    const json = (await res.json()) as {
      status: string;
      results?: { geometry?: { location?: { lat: number; lng: number } } }[];
    };
    const loc = json.results?.[0]?.geometry?.location;
    if (json.status !== "OK" || !loc) return { lat: null as number | null, lng: null as number | null };
    return { lat: loc.lat, lng: loc.lng };
  });
