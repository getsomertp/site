import { Switch, Route } from "wouter";
import { Suspense, lazy } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SiteBackground } from "@/components/SiteBackground";
import { SiteThemeApplier } from "@/components/SiteThemeApplier";
import { SkeletonList } from "@/components/SkeletonBlocks";
import Home from "@/pages/Home";

const Leaderboard = lazy(() => import("@/pages/Leaderboard"));
const Giveaways = lazy(() => import("@/pages/Giveaways"));
const Winners = lazy(() => import("@/pages/Winners"));
const Partners = lazy(() => import("@/pages/Partners"));
const Affiliates = lazy(() => import("@/pages/Affiliates"));
const Profile = lazy(() => import("@/pages/Profile"));
const StreamGames = lazy(() => import("@/pages/StreamGames"));
const Admin = lazy(() => import("@/pages/Admin"));
const NotFound = lazy(() => import("@/pages/not-found"));

function RouteFallback() {
  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
        <div className="h-10" />
        <SkeletonList count={5} />
      </div>
    </div>
  );
}

function Router() {
  const adminPath = (import.meta as any).env?.VITE_ADMIN_PATH || "/admin";

  return (
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/leaderboard" component={Leaderboard} />
        <Route path="/giveaways" component={Giveaways} />
        <Route path="/winners" component={Winners} />
        <Route path="/partners" component={Partners} />
        <Route path="/affiliates" component={Affiliates} />
        <Route path="/profile" component={Profile} />
        <Route path="/stream-games" component={StreamGames} />
        <Route path={adminPath} component={Admin} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {/* Theme + background are global so every page stays consistent */}
        <SiteThemeApplier />
        <div className="relative min-h-screen">
          <SiteBackground />
          <div className="relative z-10">
            <Toaster />
            <Router />
          </div>
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
