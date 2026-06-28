import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";

declare global {
  interface Window {
    google?: any;
    __gmapsLoading?: Promise<void>;
    __gmapsInitCb?: () => void;
  }
}

const BROWSER_KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
const TRACKING_ID = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;

// Fukuoka (Hakata station area)
const FUKUOKA_CENTER = { lat: 33.5904, lng: 130.4017 };

function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps?.importLibrary) return Promise.resolve();
  if (window.__gmapsLoading) return window.__gmapsLoading;
  if (!BROWSER_KEY) return Promise.reject(new Error("Google Maps browser key missing"));

  window.__gmapsLoading = new Promise<void>((resolve, reject) => {
    window.__gmapsInitCb = () => resolve();
    const s = document.createElement("script");
    const params = new URLSearchParams({
      key: BROWSER_KEY,
      v: "weekly",
      libraries: "places,marker",
      loading: "async",
      callback: "__gmapsInitCb",
    });
    if (TRACKING_ID) params.set("channel", TRACKING_ID);
    s.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    s.async = true;
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
  return window.__gmapsLoading;
}

interface Props {
  storeName: string;
  storeAddress: string;
  onChange: (v: { storeName: string; storeAddress: string; lat?: number; lng?: number }) => void;
}

export function StoreSearchMap({ storeName, storeAddress, onChange }: Props) {
  const { t, i18n } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const sessionTokenRef = useRef<any>(null);
  const [suggestions, setSuggestions] = useState<Array<{ placeId: string; text: string }>>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(async () => {
        if (cancelled) return;
        const { Map } = await window.google.maps.importLibrary("maps");
        const { AutocompleteSessionToken } = await window.google.maps.importLibrary("places");
        if (cancelled || !mapDivRef.current) return;
        mapRef.current = new Map(mapDivRef.current, {
          center: FUKUOKA_CENTER,
          zoom: 13,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
        });
        sessionTokenRef.current = new AutocompleteSessionToken();
        setReady(true);
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  async function fetchSuggestions(value: string) {
    if (!ready || !value.trim()) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
      const { AutocompleteSuggestion } = await window.google.maps.importLibrary("places");
      const { suggestions: list } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: value,
        sessionToken: sessionTokenRef.current,
        locationBias: {
          center: FUKUOKA_CENTER,
          radius: 30000,
        },
        language: i18n.language === "en" ? "en" : "ja",
        region: "jp",
      });
      const mapped = (list ?? [])
        .map((s: any) => {
          const p = s.placePrediction;
          if (!p) return null;
          return { placeId: p.placeId, text: p.text?.toString() ?? "" };
        })
        .filter(Boolean) as Array<{ placeId: string; text: string }>;
      setSuggestions(mapped);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function selectPlace(placeId: string, displayText: string) {
    setOpen(false);
    setSuggestions([]);
    try {
      const { Place } = await window.google.maps.importLibrary("places");
      const { Marker } = await window.google.maps.importLibrary("marker");
      const place = new Place({ id: placeId });
      await place.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
      const name = place.displayName ?? displayText;
      const address = place.formattedAddress ?? "";
      const loc = place.location;
      const lat = loc?.lat?.();
      const lng = loc?.lng?.();
      onChange({ storeName: name, storeAddress: address, lat, lng });

      if (mapRef.current && lat != null && lng != null) {
        mapRef.current.panTo({ lat, lng });
        mapRef.current.setZoom(17);
        if (markerRef.current) markerRef.current.setMap(null);
        markerRef.current = new Marker({
          map: mapRef.current,
          position: { lat, lng },
          title: name,
        });
        markerRef.current.addListener("click", () => {
          if (address) onChange({ storeName: name, storeAddress: address, lat, lng });
        });
      }
      // New session token for the next search
      const { AutocompleteSessionToken } = await window.google.maps.importLibrary("places");
      sessionTokenRef.current = new AutocompleteSessionToken();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="space-y-3 sm:col-span-2">
      <div className="relative">
        <Label>{t("request.storeName")}</Label>
        <Input
          ref={inputRef}
          value={storeName}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ storeName: v, storeAddress });
            setOpen(true);
            fetchSuggestions(v);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={i18n.language === "en" ? "e.g. Ichiran Tenjin" : "例: 一蘭 天神西通り店"}
          required
          minLength={1}
          maxLength={120}
          autoComplete="off"
        />
        {open && (suggestions.length > 0 || loading) && (
          <div className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-auto rounded-md border border-border bg-popover shadow-md">
            {loading && <div className="px-3 py-2 text-xs text-muted-foreground">...</div>}
            {suggestions.map((s) => (
              <button
                key={s.placeId}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectPlace(s.placeId, s.text)}
              >
                {s.text}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <Label>{t("request.storeAddress")}</Label>
        <Input
          value={storeAddress}
          onChange={(e) => onChange({ storeName, storeAddress: e.target.value })}
          maxLength={200}
          placeholder={i18n.language === "en" ? "Auto-filled when you select a store" : "店舗を選択すると自動入力されます"}
        />
      </div>

      <div
        ref={mapDivRef}
        className="w-full h-64 rounded-md overflow-hidden border border-border bg-muted"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!BROWSER_KEY && (
        <p className="text-xs text-destructive">Google Maps API key is not configured.</p>
      )}
    </div>
  );
}
