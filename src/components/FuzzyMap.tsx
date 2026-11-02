import { useEffect, useRef } from "react";
// Type-only import: erased at build time so SSR never loads leaflet's browser-only code.
import type { Circle as LeafletCircle, Map as LeafletMap } from "leaflet";

// Add a deterministic random offset (~50-100m) per id to fuzz position for safety.
function fuzz(lat: number, lng: number, seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const r1 = ((h & 0xffff) / 0xffff) * 2 - 1;
  const r2 = (((h >> 16) & 0xffff) / 0xffff) * 2 - 1;
  // ~ 0.0008 deg ≈ 90m
  return { lat: lat + r1 * 0.0008, lng: lng + r2 * 0.0008 };
}

interface Props {
  lat: number;
  lng: number;
  fuzzSeed?: string;
  radiusMeters?: number;
  className?: string;
}

// leaflet touches `window` at import time, so it must be loaded dynamically in the browser.
export function FuzzyMap({ lat, lng, fuzzSeed, radiusMeters = 90, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const p = fuzzSeed ? fuzz(lat, lng, fuzzSeed) : { lat, lng };
    let cancelled = false;
    let circle: LeafletCircle | null = null;

    void Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]).then(([L]) => {
      if (cancelled || !ref.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(ref.current, { zoomControl: false, attributionControl: false })
          .setView([p.lat, p.lng], 16);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
        }).addTo(mapRef.current);
      } else {
        mapRef.current.setView([p.lat, p.lng], 16);
      }
      circle = L.circle([p.lat, p.lng], {
        radius: radiusMeters,
        color: "hsl(0,72%,45%)",
        fillColor: "hsl(0,72%,55%)",
        fillOpacity: 0.2,
      }).addTo(mapRef.current);
    });

    return () => {
      cancelled = true;
      if (circle && mapRef.current) mapRef.current.removeLayer(circle);
    };
  }, [lat, lng, fuzzSeed, radiusMeters]);

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);

  return <div ref={ref} className={className ?? "w-full h-64 rounded-md overflow-hidden border border-border"} />;
}
