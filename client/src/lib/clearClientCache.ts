// Clears client-side caches/storage and forces a reload with a cache-buster.
// Note: Browsers don't allow clearing the HTTP cache directly from JS, but this
// handles the most common causes of "blank page" after deploys (stale assets).

export async function clearClientCacheAndReload() {
  // Clear Cache Storage (if any)
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // ignore
  }

  // Clear Web Storage (safe: auth is cookie-based)
  try {
    sessionStorage.clear();
  } catch {
    // ignore
  }
  try {
    // Keep localStorage clearing conservative: remove our known keys if present.
    // If unknown, fall back to full clear.
    const knownKeys = ["getsomesite", "getsomesite:cb", "siteTheme", "theme"]; // harmless if missing
    let removed = 0;
    for (const k of knownKeys) {
      if (localStorage.getItem(k) !== null) {
        localStorage.removeItem(k);
        removed++;
      }
    }
    if (removed === 0) {
      // No known keys found — a full clear is usually fine and fixes more cases.
      localStorage.clear();
    }
  } catch {
    // ignore
  }

  // Unregister service workers (if any)
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    // ignore
  }

  // Force a reload that bypasses stale HTML/asset caches.
  const u = new URL(window.location.href);
  u.searchParams.set("__cb", String(Date.now()));
  window.location.replace(u.toString());
}
