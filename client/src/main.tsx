import * as Sentry from "@sentry/react";
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Optional Sentry (frontend). Set VITE_SENTRY_DSN to enable.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN as string,
    environment: import.meta.env.MODE,
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || 0),
  });
}

function CrashScreen({ error, resetError }: { error: unknown; resetError: () => void }) {
  const [showDetails, setShowDetails] = useState(false);

  const message = useMemo(() => {
    if (!error) return "Unknown error";
    if (typeof error === "string") return error;
    const anyErr = error as any;
    return anyErr?.message || anyErr?.toString?.() || "Unknown error";
  }, [error]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 720, width: "100%" }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Something went wrong</div>
        <div style={{ opacity: 0.8, marginBottom: 16 }}>
          Try refreshing. If it keeps happening, copy the details below and send them to the admin.
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "white" }}
          >
            Reload
          </button>
          <button
            onClick={() => resetError()}
            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "white" }}
          >
            Try again
          </button>
          <button
            onClick={() => setShowDetails((v) => !v)}
            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "white" }}
          >
            {showDetails ? "Hide details" : "Show details"}
          </button>
        </div>

        {showDetails ? (
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.35)",
              color: "#f1f5f9",
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            {message}
          </pre>
        ) : null}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary
    fallback={({ error, resetError }) => <CrashScreen error={error} resetError={resetError} />}
    onError={(error, componentStack) => {
      // Ensure we always have something actionable in the browser console
      // even when Sentry DSN isn't configured.
      // eslint-disable-next-line no-console
      console.error("[App Crash]", error);
      // eslint-disable-next-line no-console
      console.error("[Component Stack]", componentStack);
    }}
  >
    <App />
  </Sentry.ErrorBoundary>
);
