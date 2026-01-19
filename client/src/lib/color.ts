function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function normalizeHex(input: string, fallback = "#b026ff") {
  const v = (input || "").trim();
  if (!v) return fallback;
  const m = v.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return fallback;
  if (m[1].length === 3) {
    const [r, g, b] = m[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return v.toLowerCase();
}

export function hexToHslChannels(hex: string) {
  const h = normalizeHex(hex);
  const r = parseInt(h.slice(1, 3), 16) / 255;
  const g = parseInt(h.slice(3, 5), 16) / 255;
  const b = parseInt(h.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let hue = 0;
  if (d !== 0) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  const light = (max + min) / 2;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * light - 1));

  const H = Math.round(hue);
  const S = Math.round(clamp(sat, 0, 1) * 100);
  const L = Math.round(clamp(light, 0, 1) * 100);

  // Matches tailwind/shadcn HSL channel format: "280 100% 60%"
  return `${H} ${S}% ${L}%`;
}
