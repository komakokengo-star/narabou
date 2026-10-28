import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { availabilityInput, type AvailabilityState } from "@/lib/availability";

export const getMyAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_worker_availability");
    if (error) throw new Error(error.message);
    return data as AvailabilityState | null;
  });

export const setMyAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(availabilityInput)
  .handler(async ({ context, data }) => {
    const { data: state, error } = await context.supabase.rpc("set_worker_availability", { p_area: data.area, p_available: data.available });
    if (error) throw new Error(error.message);
    return state as AvailabilityState;
  });

export const renewMyAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.rpc("renew_worker_availability");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getAvailabilityCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_worker_availability_counts");
    if (error) throw new Error(error.message);
    return data ?? [];
  });