import { useMemo, useState, type Dispatch, type SetStateAction, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Calendar, Trophy, Zap, LogIn, Users } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type StreamEvent = {
  id: number;
  title: string;
  type: string; // tournament | bonus_hunt | guess_balance | other
  status: string; // draft | open | locked | in_progress | completed
  startsAt?: string;
  endsAt?: string;
  createdAt?: string;
  isPublic?: boolean;
  maxPlayers?: number | null;
  entriesCount?: number;
  hasEntered?: boolean;
  canEnter?: boolean;
};

export default function StreamGames() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [slotByEvent, setSlotByEvent] = useState<Record<number, string>>({});

  const { data: session } = useQuery<{ user: any | null }>({
    queryKey: ["/api/auth/me"],
  });
  const isLoggedIn = Boolean(session?.user?.id);

  const { data: events = [], isLoading } = useQuery<StreamEvent[]>({
    queryKey: ["/api/stream-events"],
  });

  const beginDiscordLogin = () => {
    window.location.href = "/api/auth/discord";
  };

  const enterMutation = useMutation({
    mutationFn: async (args: { eventId: number; slotChoice: string }) => {
      const res = await fetch(`/api/stream-events/${args.eventId}/entries`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotChoice: args.slotChoice }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to enter");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stream-events"] });
      toast({ title: "Entered!", description: "You are now entered for this event." });
    },
    onError: (err: any) => {
      toast({ title: "Could not enter", description: err?.message || "Try again", variant: "destructive" });
    },
  });

  const publicEvents = useMemo(() => {
    return (events || []).filter((e) => e.isPublic !== false && e.status !== "draft");
  }, [events]);

  const tournaments = useMemo(
    () => publicEvents.filter((e) => (e.type || "").toLowerCase().includes("tournament")),
    [publicEvents],
  );
  const bonusHunts = useMemo(
    () => publicEvents.filter((e) => (e.type || "").toLowerCase().includes("bonus")),
    [publicEvents],
  );
  const guessBalance = useMemo(
    () => publicEvents.filter((e) => (e.type || "").toLowerCase().includes("guess")),
    [publicEvents],
  );

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
            <h1 className="text-4xl md:text-5xl font-display font-bold text-white mb-3">Stream Games</h1>
            <p className="text-lg text-white/70">Join live games during stream. Tournaments, bonus hunts, and more.</p>
          </motion.div>

          {!isLoggedIn && (
            <Card className="mb-6 p-4 bg-white/5 border-white/10 flex items-center justify-between gap-4">
              <div className="text-white/80">
                <div className="font-semibold text-white">Connect Discord to enter games</div>
                <div className="text-sm text-white/60">You need to be logged in to enter stream events.</div>
              </div>
              <Button onClick={beginDiscordLogin} className="bg-neon-purple hover:opacity-90">
                <LogIn className="w-4 h-4 mr-2" /> Connect Discord
              </Button>
            </Card>
          )}

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
              <EventList
                isLoading={isLoading}
                events={tournaments}
                empty="No tournaments yet."
                isLoggedIn={isLoggedIn}
                slotByEvent={slotByEvent}
                setSlotByEvent={setSlotByEvent}
                onEnter={(eventId) => {
                  const slotChoice = (slotByEvent[eventId] || "").trim();
                  if (!slotChoice) {
                    toast({ title: "Slot required", description: "Type your slot name to enter." });
                    return;
                  }
                  enterMutation.mutate({ eventId, slotChoice });
                }}
                enterLoading={enterMutation.isPending}
              />
            </TabsContent>
            <TabsContent value="bonus" className="mt-6">
              <EventList
                isLoading={isLoading}
                events={bonusHunts}
                empty="No bonus hunts yet."
                isLoggedIn={isLoggedIn}
                slotByEvent={slotByEvent}
                setSlotByEvent={setSlotByEvent}
                onEnter={(eventId) => {
                  const slotChoice = (slotByEvent[eventId] || "").trim();
                  if (!slotChoice) {
                    toast({ title: "Slot required", description: "Type your slot name to enter." });
                    return;
                  }
                  enterMutation.mutate({ eventId, slotChoice });
                }}
                enterLoading={enterMutation.isPending}
              />
            </TabsContent>
            <TabsContent value="guess" className="mt-6">
              <Card className="p-4 mb-4 bg-white/5 border-white/10 text-white/70">
                Guess Balance entries are <span className="text-white">coming soon</span>. This tab is view-only for now.
              </Card>
              <EventList
                isLoading={isLoading}
                events={guessBalance}
                empty="No guess balance games yet."
                isLoggedIn={isLoggedIn}
                slotByEvent={slotByEvent}
                setSlotByEvent={setSlotByEvent}
                onEnter={() => {}}
                enterLoading={false}
                disableEntry
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function statusBadge(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "open") return <Badge className="bg-green-500/20 text-green-300 border border-green-500/30">Open</Badge>;
  if (s === "locked") return <Badge className="bg-yellow-500/20 text-yellow-200 border border-yellow-500/30">Locked</Badge>;
  if (s === "in_progress") return <Badge className="bg-blue-500/20 text-blue-200 border border-blue-500/30">Live</Badge>;
  if (s === "completed") return <Badge className="bg-white/10 text-white/70 border border-white/10">Finished</Badge>;
  return <Badge className="bg-white/10 text-white/70 border border-white/10">{status}</Badge>;
}

function EventList({
  isLoading,
  events,
  empty,
  isLoggedIn,
  slotByEvent,
  setSlotByEvent,
  onEnter,
  enterLoading,
  disableEntry,
}: {
  isLoading: boolean;
  events: StreamEvent[];
  empty: string;
  isLoggedIn: boolean;
  slotByEvent: Record<number, string>;
  setSlotByEvent: Dispatch<SetStateAction<Record<number, string>>>;
  onEnter: (eventId: number) => void;
  enterLoading: boolean;
  disableEntry?: boolean;
}) {
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

  const active = events.filter((e) => ["open", "locked", "in_progress"].includes(String(e.status || "").toLowerCase()));
  const finished = events.filter((e) => String(e.status || "").toLowerCase() === "completed");

  return (
    <div className="grid gap-4">
      <Section title="Current games" items={active} render={(ev) => (
        <EventCard
          key={ev.id}
          ev={ev}
          isLoggedIn={isLoggedIn}
          slotValue={slotByEvent[ev.id] || ""}
          onSlotChange={(v) => setSlotByEvent((p) => ({ ...p, [ev.id]: v }))}
          onEnter={() => onEnter(ev.id)}
          enterLoading={enterLoading}
          disableEntry={disableEntry}
        />
      )} empty="No active games available." />

      <Section title="Finished" items={finished} render={(ev) => (
        <EventCard
          key={ev.id}
          ev={ev}
          isLoggedIn={isLoggedIn}
          slotValue={""}
          onSlotChange={() => {}}
          onEnter={() => {}}
          enterLoading={false}
          disableEntry
        />
      )} empty="No finished games yet." />
    </div>
  );
}

function Section({
  title,
  items,
  empty,
  render,
}: {
  title: string;
  items: StreamEvent[];
  empty: string;
  render: (ev: StreamEvent) => ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="text-white/80 font-semibold">{title}</div>
      {items.length ? (
        <div className="grid gap-4">{items.map(render)}</div>
      ) : (
        <Card className="p-6 bg-white/5 border-white/10 text-white/70">{empty}</Card>
      )}
    </div>
  );
}

function EventCard({
  ev,
  isLoggedIn,
  slotValue,
  onSlotChange,
  onEnter,
  enterLoading,
  disableEntry,
}: {
  ev: StreamEvent;
  isLoggedIn: boolean;
  slotValue: string;
  onSlotChange: (v: string) => void;
  onEnter: () => void;
  enterLoading: boolean;
  disableEntry?: boolean;
}) {
  const type = String(ev.type || "").toLowerCase();
  const isGuess = type.includes("guess");
  const hasEntered = Boolean(ev.hasEntered);
  const entriesCount = typeof ev.entriesCount === "number" ? ev.entriesCount : undefined;
  const isFull = typeof ev.maxPlayers === "number" && ev.maxPlayers > 0 && typeof entriesCount === "number" && entriesCount >= ev.maxPlayers;

  const showEntryUI = !disableEntry && !isGuess && String(ev.status || "").toLowerCase() === "open";
  const canEnter = Boolean(ev.canEnter);

  return (
    <Card className="p-6 bg-white/5 border-white/10">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="text-white font-semibold text-lg truncate">{ev.title}</div>
            {statusBadge(ev.status)}
            {isGuess ? (
              <Badge className="bg-white/10 text-white/70 border border-white/10">Coming soon</Badge>
            ) : null}
          </div>
          <div className="text-white/60 text-sm mt-1">Type: <span className="text-white/80">{ev.type}</span></div>
          <div className="flex items-center gap-2 text-white/60 text-sm mt-2">
            <Users className="w-4 h-4" />
            <span>
              {typeof entriesCount === "number" ? entriesCount : "—"}
              {typeof ev.maxPlayers === "number" && ev.maxPlayers > 0 ? ` / ${ev.maxPlayers}` : ""} entered
            </span>
            {isFull ? <Badge className="bg-red-500/20 text-red-200 border border-red-500/30">Full</Badge> : null}
            {hasEntered ? <Badge className="bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30">Entered</Badge> : null}
          </div>
        </div>

        <div className="text-right text-white/60 text-sm">
          {ev.startsAt ? <div>Starts: {new Date(ev.startsAt).toLocaleString()}</div> : null}
          {ev.endsAt ? <div>Ends: {new Date(ev.endsAt).toLocaleString()}</div> : null}
        </div>
      </div>

      {showEntryUI && (
        <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:items-center">
          <Input
            placeholder="Slot name (required)"
            value={slotValue}
            onChange={(e) => onSlotChange(e.target.value)}
            className="bg-white/5 border-white/10 text-white"
            disabled={!isLoggedIn || hasEntered || isFull}
          />
          <Button
            onClick={onEnter}
            disabled={!isLoggedIn || !canEnter || hasEntered || isFull || enterLoading}
            className="bg-gradient-to-r from-neon-purple to-neon-cyan hover:opacity-90"
          >
            {hasEntered ? "Entered" : "Enter"}
          </Button>
        </div>
      )}

      {!disableEntry && isGuess && (
        <div className="mt-4 text-white/60 text-sm">
          Entries are disabled for Guess Balance until the feature is complete.
        </div>
      )}
    </Card>
  );
}
