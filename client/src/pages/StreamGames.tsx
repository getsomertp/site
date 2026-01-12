import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Calendar, Trophy, Zap } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type StreamEvent = {
  id: number;
  title: string;
  type: string; // tournament | bonus_hunt | guess_balance | other
  status: string; // draft | live | completed
  startsAt?: string;
  endsAt?: string;
  createdAt?: string;
  isPublic?: boolean;
  entries?: any[];
  bracketJson?: any;
};

export default function StreamGames() {
  const { data: events = [], isLoading } = useQuery<StreamEvent[]>({
    queryKey: ["/api/stream-events"],
  });

  const publicEvents = (events || []).filter(e => e.isPublic !== false && e.status !== "draft");
  const tournaments = publicEvents.filter(e => (e.type || "").toLowerCase().includes("tournament"));
  const bonusHunts = publicEvents.filter(e => (e.type || "").toLowerCase().includes("bonus"));
  const guessBalance = publicEvents.filter(e => (e.type || "").toLowerCase().includes("guess"));

  return (
    <div className="min-h-screen">
      <Navigation />
      <div className="pt-28 pb-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center mb-10"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h1 className="text-4xl md:text-5xl font-display font-bold text-white mb-3">
              Stream Games
            </h1>
            <p className="text-lg text-white/70">
              Join live games during stream. Tournaments, bonus hunts, and more.
            </p>
          </motion.div>

          <Tabs defaultValue="tournaments" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-white/5 border border-white/10">
              <TabsTrigger value="tournaments" className="data-[state=active]:bg-white/10">
                <Trophy className="w-4 h-4 mr-2" /> Tournaments
              </TabsTrigger>
              <TabsTrigger value="bonus" className="data-[state=active]:bg-white/10">
                <Zap className="w-4 h-4 mr-2" /> Bonus Hunts
              </TabsTrigger>
              <TabsTrigger value="guess" className="data-[state=active]:bg-white/10">
                <Calendar className="w-4 h-4 mr-2" /> Guess Balance
              </TabsTrigger>
            </TabsList>

            <TabsContent value="tournaments" className="mt-6">
              <EventList isLoading={isLoading} events={tournaments} empty="No public tournaments yet." />
            </TabsContent>
            <TabsContent value="bonus" className="mt-6">
              <EventList isLoading={isLoading} events={bonusHunts} empty="No public bonus hunts yet." />
            </TabsContent>
            <TabsContent value="guess" className="mt-6">
              <EventList isLoading={isLoading} events={guessBalance} empty="No public guess balance games yet." />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function EventList({ isLoading, events, empty }: { isLoading: boolean; events: StreamEvent[]; empty: string }) {
  if (isLoading) {
    return (
      <div className="grid gap-4">
        <Card className="p-6 bg-white/5 border-white/10 text-white/70">Loading…</Card>
        <Card className="p-6 bg-white/5 border-white/10 text-white/70">Loading…</Card>
      </div>
    );
  }

  if (!events.length) {
    return <Card className="p-6 bg-white/5 border-white/10 text-white/70">{empty}</Card>;
  }

  return (
    <div className="grid gap-4">
      {events.map(ev => (
        <Card key={ev.id} className="p-6 bg-white/5 border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-white font-semibold text-lg">{ev.title}</div>
              <div className="text-white/60 text-sm mt-1">
                Status: <span className="text-white/80">{ev.status}</span>
              </div>
            </div>
            <div className="text-right text-white/60 text-sm">
              {ev.startsAt ? <div>Starts: {new Date(ev.startsAt).toLocaleString()}</div> : null}
              {ev.endsAt ? <div>Ends: {new Date(ev.endsAt).toLocaleString()}</div> : null}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
