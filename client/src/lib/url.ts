// Small helper to ensure external links open correctly.
// If a URL is missing a scheme (e.g. "acebet.com/..."), browsers treat it as a relative path.
// We normalize it to https://...

export function normalizeExternalUrl(url?: string | null): string | undefined {
  if (url === undefined || url === null) return undefined;
  const s = String(url).trim();
  if (!s) return undefined;
  // allow internal/relative URLs
  if (s.startsWith("/") || s.startsWith("data:")) return s;
  if (/^https?:\/\//i.test(s)) return s;
  // handle schemeless URLs like //example.com
  return `https://${s.replace(/^\/\/+/, "")}`;
}
