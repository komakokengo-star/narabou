import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth, useRoles } from "@/lib/auth";
import { getMyAvailability, renewMyAvailability } from "@/lib/availability.functions";
import { isAvailabilityActive } from "@/lib/availability";

export function useWorkerAvailability() {
  const { user } = useAuth();
  const { data: roles } = useRoles(user?.id);
  const getState = useServerFn(getMyAvailability);
  return useQuery({
    queryKey: ["worker-availability", user?.id],
    queryFn: () => getState(),
    enabled: !!user && !!roles?.includes("worker"),
    refetchInterval: 30000,
  });
}

export function WorkerAvailabilityHeartbeat() {
  const { data: state } = useWorkerAvailability();
  const renew = useServerFn(renewMyAvailability);
  const qc = useQueryClient();
  const active = isAvailabilityActive(state);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        await renew();
      } finally {
        if (!cancelled) await qc.invalidateQueries({ queryKey: ["worker-availability"] });
      }
    };
    const onVisible = () => { void tick().catch(() => {}); };
    const interval = window.setInterval(onVisible, 60000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, renew, qc]);
  return null;
}