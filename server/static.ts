import express, { type Express } from "express";
import fs from "fs";
import path from "path";

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
          res.setHeader("Cache-Control", "no-store");
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

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
