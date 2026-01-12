import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import Leaderboard from "@/pages/Leaderboard";
import Giveaways from "@/pages/Giveaways";
import Affiliates from "@/pages/Affiliates";
import Profile from "@/pages/Profile";
import StreamGames from "@/pages/StreamGames";
import Admin from "@/pages/Admin";
import NotFound from "@/pages/not-found";

function Router() {
  const adminPath = (import.meta as any).env?.VITE_ADMIN_PATH || "/admin";

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/stream-games" component={StreamGames} />
      <Route path="/giveaways" component={Giveaways} />
      <Route path="/affiliates" component={Affiliates} />
      <Route path="/profile" component={Profile} />
      <Route path={adminPath} component={Admin} />
      {adminPath !== "/admin" && <Route path="/admin" component={Admin} />}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
