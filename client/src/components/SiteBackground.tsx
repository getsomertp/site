import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import defaultBg from "@assets/generated_images/dark_neon_casino_background.webp";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parseOverlay(v: unknown, fallback = 0.78) {
  const n = Number(String(v ?? "").trim());
  if (!Number.isFinite(n)) return fallback;
  // allow either 0-1 or 40-90 style
  if (n > 1.2) return clamp(n / 100, 0.4, 0.9);
  return clamp(n, 0.4, 0.9);
}

function useImageReady(src: string) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    setReady(false);

    const img = new Image();
    // Hint the browser to decode off the main thread when possible.
    (img as any).decoding = "async";
    img.src = src;

    if (img.complete) {
      setReady(true);
      return;
    }

    img.onload = () => {
      if (!alive) return;
      setReady(true);
    };
    img.onerror = () => {
      // If the URL is invalid, don’t block the UI — we’ll still show overlays.
      if (!alive) return;
      setReady(true);
    };

    return () => {
      alive = false;
    };
  }, [src]);

  return ready;
}

export function SiteBackground() {
  const { data: settingsRaw } = useQuery<Record<string, string> | null>({
    queryKey: ["/api/site/settings"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 60_000,
  });

  const settings = (settingsRaw as any) || {};

  const bgUrl = String(settings.themeBackgroundUrl || settings.bgUrl || "").trim() || defaultBg;
  const overlay = parseOverlay(settings.themeOverlay, 0.78);
  const ready = useImageReady(bgUrl);

  const bgStyle = useMemo(() => {
    // Keep it crisp, but readable.
    return {
      backgroundImage: `url(${bgUrl})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      filter: "saturate(1.1) contrast(1.05) brightness(0.85)",
    } as const;
  }, [bgUrl]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      {/* Fast paint baseline */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 600px at 25% 20%, rgba(180,38,255,0.12), transparent 60%)," +
            "radial-gradient(900px 520px at 80% 30%, rgba(255,196,76,0.08), transparent 62%)," +
            "radial-gradient(1000px 700px at 70% 85%, rgba(255,64,180,0.06), transparent 65%)," +
            "linear-gradient(180deg, rgba(0,0,0,0.65), rgba(0,0,0,0.85))",
        }}
      />

      {/* Real background image fades in when decoded (avoids a “blank” first paint) */}
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{ ...bgStyle, opacity: ready ? 1 : 0 }}
      />

      {/* Darkness overlay (admin adjustable) */}
      <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${overlay})` }} />

      {/* Accent glows (track CSS vars so accent color changes propagate) */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 600px at 25% 20%, hsl(var(--primary) / 0.22), transparent 60%)," +
            "radial-gradient(900px 520px at 80% 30%, hsl(var(--neon-gold) / 0.14), transparent 62%)," +
            "radial-gradient(1000px 700px at 70% 85%, hsl(var(--neon-pink) / 0.12), transparent 65%)",
        }}
      />

      {/* Vignette for a premium "focus" look */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.7) 100%)",
        }}
      />
    </div>
  );
}
