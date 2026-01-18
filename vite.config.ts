import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { metaImagesPlugin } from "./vite-plugin-meta-images";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    tailwindcss(),
    metaImagesPlugin(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // NOTE:
          // Keep chunking simple and avoid accidental "react" matches like
          // "lucide-react" or "@radix-ui/react-*" which can introduce
          // circular inter-chunk initialization issues in some builds.
          if (!id.includes("node_modules")) return;

          const nm = id.split("node_modules/")[1] || "";

          // UI libs
          if (nm.startsWith("@radix-ui/")) return "radix";
          if (nm.startsWith("@tanstack/")) return "tanstack";

          // React core only
          if (
            nm.startsWith("react/") ||
            nm === "react" ||
            nm.startsWith("react-dom/") ||
            nm === "react-dom" ||
            nm.startsWith("scheduler/") ||
            nm === "scheduler"
          ) {
            return "react";
          }

          // Animations + charts
          if (nm.includes("framer-motion")) return "motion";
          if (nm.includes("recharts") || nm.includes("d3")) return "charts";

          return "vendor";
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
