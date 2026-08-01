import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

export const reverseGeocode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { lat: number; lng: number }) => {
    if (typeof d.lat !== "number" || typeof d.lng !== "number") throw new Error("invalid coords");
    if (d.lat < -90 || d.lat > 90 || d.lng < -180 || d.lng > 180) throw new Error("invalid coords");
    return d;
  })
  .handler(async ({ data }) => {
    const ownKey = process.env.GOOGLE_API_KEY;
    const lovableKey = process.env.LOVABLE_API_KEY;
    const gmKey = process.env.GOOGLE_MAPS_API_KEY;

    const url = ownKey
      ? `https://maps.googleapis.com/maps/api/geocode/json?latlng=${data.lat},${data.lng}&language=ja&key=${ownKey}`
      : `${GATEWAY_URL}/maps/api/geocode/json?latlng=${data.lat},${data.lng}&language=ja`;
    if (!ownKey && (!lovableKey || !gmKey)) throw new Error("Google Maps 接続が未設定です");

    const res = await fetch(url, {
      headers: ownKey
        ? {}
        : {
            Authorization: `Bearer ${lovableKey}`,
            "X-Connection-Api-Key": gmKey!,
          },
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("reverse geocode failed", res.status, body);
      throw new Error(`住所検索に失敗しました (${res.status})`);
    }

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
    const lovableKey = process.env.LOVABLE_API_KEY;
    const gmKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey || !gmKey) throw new Error("Google Maps 接続が未設定です");
    const url = `${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(data.address)}&language=ja&region=jp`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmKey,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("forward geocode failed", res.status, body);
      throw new Error(`住所座標変換に失敗しました (${res.status})`);
    }
    const json = (await res.json()) as {
      status: string;
      results?: { geometry?: { location?: { lat: number; lng: number } } }[];
    };
    const loc = json.results?.[0]?.geometry?.location;
    if (json.status !== "OK" || !loc) return { lat: null as number | null, lng: null as number | null };
    return { lat: loc.lat, lng: loc.lng };
  });
