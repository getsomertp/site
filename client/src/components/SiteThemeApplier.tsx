import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { hexToHslChannels, normalizeHex } from "@/lib/color";

export function SiteThemeApplier() {
  const { data: settingsRaw } = useQuery<Record<string, string> | null>({
    queryKey: ["/api/site/settings"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 60_000,
  });

  const settings = (settingsRaw as any) || {};

  useEffect(() => {
    // Apply a few theme values directly to CSS vars so they affect everything
    // (buttons, focus rings, glow utilities, etc).
    const accent = normalizeHex(String(settings.themeAccent || ""), "#b026ff");
    const accentHsl = hexToHslChannels(accent);

    const root = document.documentElement;

    // Primary accent
    root.style.setProperty("--primary", accentHsl);
    root.style.setProperty("--ring", accentHsl);
    root.style.setProperty("--neon-purple", accentHsl);
    root.style.setProperty("--chart-1", accentHsl);

    // Keep the derived outline color feeling consistent with the new accent.
    // (Fallbacks are fine; this just makes outline buttons look premium.)
    root.style.setProperty("--button-outline", "hsl(var(--foreground) / 0.16)");
    root.style.setProperty("--badge-outline", "hsl(var(--foreground) / 0.16)");

    return () => {
      // No cleanup needed; theme should persist while the app is mounted.
    };
  }, [settings.themeAccent]);

  return null;
}
