import { z } from "zod";

export const AVAILABILITY_AREAS = ["東京", "横浜", "名古屋", "大阪", "京都", "神戸", "札幌", "仙台", "広島", "福岡"] as const;
export const availabilityInput = z.object({ area: z.enum(AVAILABILITY_AREAS), available: z.boolean() });
export type AvailabilityState = { area: string; is_available: boolean; expires_at: string };

export function isAvailabilityActive(state: AvailabilityState | null | undefined, now = Date.now()) {
  return !!state?.is_available && Date.parse(state.expires_at) > now;
}