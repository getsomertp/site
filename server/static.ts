import express, { type Express } from "express";
import fs from "fs";
import path from "path";

function isAssetLikePath(p: string) {
  // If it looks like a file request (/assets/x.js, /favicon.png, /robots.txt, etc),
  // we should NOT fall back to index.html.
  if (p.startsWith("/assets/")) return true;
  if (p.startsWith("/uploads/")) return true;
  if (p === "/favicon.ico") return true;
  // Any path that ends with an extension is an asset-like request.
  return /\.[a-z0-9]+$/i.test(p);
}

function setNoCacheHtml(res: express.Response) {
  // Strong no-cache headers for the HTML shell.
  // This prevents the classic "cached HTML points at missing hashed assets" blank page.
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

function setNoStore(res: express.Response) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

function missingAssetRecoveryModule(req: express.Request) {
  // If a cached HTML shell references an old hashed asset that no longer exists,
  // returning index.html (text/html) causes the browser to refuse to execute the module.
  // Returning 404 can also leave the user with a blank screen.
  //
  // Instead, return a tiny JS module that forces a full reload with a cache-busting param.
  // This recovers automatically for users behind aggressive edge caching/CDNs.
  const cb = Date.now();
  const to = `/?__cb=${cb}`;
  const pathInfo = String(req.path || "");
  return `// Missing asset: ${pathInfo}\n` +
    `try {\n` +
    `  const u = new URL(window.location.href);\n` +
    `  u.searchParams.set('__cb', String(${cb}));\n` +
    `  window.location.replace(u.toString());\n` +
    `} catch {\n` +
    `  window.location.replace('${to}');\n` +
    `}\n` +
    `export {};\n`;
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Serve built assets with sensible caching. The index.html should not be cached
  // aggressively so deploys update instantly.
  app.use(
    express.static(distPath, {
      // Default for non-hashed files (e.g., manifest).
      maxAge: "7d",
      etag: true,
      setHeaders(res, filePath) {
        if (filePath.endsWith("index.html")) {
          // Never cache the HTML shell so deploys update instantly.
          setNoCacheHtml(res);
          return;
        }

        const base = path.basename(filePath);
        const looksHashed = /\.[0-9a-f]{8,}\./i.test(base);
        const isViteAsset = filePath.replace(/\\/g, "/").includes("/assets/");

        if (looksHashed || isViteAsset) {
          // Long-lived immutable caching for hashed assets.
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );

  // Fall through to index.html for SPA routes only.
  // IMPORTANT: do not serve index.html for missing assets (or you'll get
  // "module script MIME type text/html" errors + a "blank" app).
  app.use("*", (req, res) => {
    if (isAssetLikePath(req.path)) {
      // If it's a missing JS module under /assets, return a recovery module instead of 404.
      // This fixes the most common "blank screen" issue after deploys when HTML is cached.
      if (req.path.startsWith("/assets/") && /\.(m?js)$/i.test(req.path)) {
        setNoStore(res);
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.status(200).send(missingAssetRecoveryModule(req));
        return;
      }

      // For everything else asset-like, do not fall back to HTML.
      res.status(404).end();
      return;
    }

    setNoCacheHtml(res);
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
