import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Navigation } from "@/components/Navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Sparkles, Dice5 } from "lucide-react";
import { getQueryFn } from "@/lib/queryClient";

type StreamEvent = {
  id: number;
  type: "tournament" | "bonus_hunt" | "guess_balance" | string;
  title: string;
  status: "draft" | "open" | "locked" | "in_progress" | "completed" | string;
  maxPlayers?: number | null;
  startingBalance?: string | null;
  currentEntryId?: number | null;
  createdAt?: string;
  updatedAt?: string;
  entries: StreamEventEntry[];
  brackets?: TournamentBracket[];
};

type StreamEventEntry = {
  id: number;
  eventId: number;
  displayName: string;
  slotChoice: string;
  category?: string | null;
  status: string;
  payout?: string | null;
};

type TournamentBracket = {
  id: number;
  eventId: number;
  round: number;
  matchIndex: number;
  playerAId: number | null;
  playerBId: number | null;
  winnerId: number | null;
  status: string;
};

function statusColor(status: string) {
  if (status === "open") return "bg-neon-cyan/20 text-neon-cyan";
  if (status === "locked") return "bg-neon-gold/20 text-neon-gold";
  if (status === "in_progress") return "bg-neon-purple/20 text-neon-purple";
  if (status === "completed") return "bg-green-500/20 text-green-400";
  return "bg-white/10 text-muted-foreground";
}

function typeLabel(type: string) {
  if (type === "tournament") return "Tournament";
  if (type === "bonus_hunt") return "Bonus Hunt";
  if (type === "guess_balance") return "Guess the Balance";
  return type;
}

export default function StreamGames() {
  const [tab, setTab] = useState<"tournament" | "bonus_hunt" | "guess_balance">("tournament");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: events, isLoading } = useQuery<StreamEvent[]>({
    queryKey: ["/api/stream-events"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const filtered = useMemo(() => {
    const list = (events || []).filter((e) => e.type === tab);
    // Prefer active-ish stuff first.
    const order: Record<string, number> = { in_progress: 0, locked: 1, open: 2, completed: 3, draft: 4 };
    return list.sort((a, b) => (order[a.status] ?? 99) - (order[b.status] ?? 99));
  }, [events, tab]);

  const selected = useMemo(() => {
    if (!filtered.length) return null;
    const found = selectedId ? filtered.find((e) => e.id === selectedId) : undefined;
    return found || filtered[0];
  }, [filtered, selectedId]);

  const entryById = useMemo(() => {
    const map = new Map<number, StreamEventEntry>();
    for (const e of selected?.entries || []) map.set(e.id, e);
    return map;
  }, [selected]);

  const bracketsByRound = useMemo(() => {
    const rounds = new Map<number, TournamentBracket[]>();
    for (const b of selected?.brackets || []) {
      rounds.set(b.round, [...(rounds.get(b.round) || []), b]);
    }
    // Sort matches by matchIndex
    for (const [r, arr] of rounds) {
      rounds.set(r, arr.sort((a, b) => a.matchIndex - b.matchIndex));
    }
    return [...rounds.entries()].sort((a, b) => a[0] - b[0]);
  }, [selected]);

  return (
    <div className="min-h-screen">
      <Navigation />

      <div className="pt-28 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-white">
            Stream <span className="text-neon-gold text-glow-gold">Games</span>
          </h1>
          <p className="text-muted-foreground mt-2">
            These are created in Admin, but everyone can view the current brackets, entries, and status.
          </p>
        </motion.div>

        <Tabs value={tab} onValueChange={(v) => { setTab(v as any); setSelectedId(null); }}>
          <TabsList className="glass border border-white/10">
            <TabsTrigger value="tournament" className="gap-2">
              <Trophy className="w-4 h-4" /> Tournaments
            </TabsTrigger>
            <TabsTrigger value="bonus_hunt" className="gap-2">
              <Sparkles className="w-4 h-4" /> Bonus Hunts
            </TabsTrigger>
            <TabsTrigger value="guess_balance" className="gap-2">
              <Dice5 className="w-4 h-4" /> Guess Balance
            </TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-6">
            <div className="flex flex-col lg:flex-row gap-6">
              <Card className="lg:w-80 bg-card/50 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display font-bold">{typeLabel(tab)}</h3>
                  <Badge className="bg-white/10 text-muted-foreground">{filtered.length}</Badge>
                </div>

                {isLoading && (
                  <div className="text-muted-foreground text-sm">Loading…</div>
                )}

                {!isLoading && filtered.length === 0 && (
                  <div className="text-muted-foreground text-sm">No stream games yet.</div>
                )}

                <div className="space-y-2">
                  {filtered.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => setSelectedId(e.id)}
                      className={`w-full text-left p-3 rounded-lg transition border ${
                        selected?.id === e.id ? "border-neon-gold/60 bg-white/5" : "border-white/10 hover:bg-white/5"
                      }`}
                      data-testid={`stream-game-${e.id}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-white truncate">{e.title}</div>
                        <span className={`text-xs px-2 py-1 rounded ${statusColor(e.status)}`}>{e.status}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {e.entries?.length ?? 0}{e.maxPlayers ? ` / ${e.maxPlayers}` : ""} entries
                      </div>
                    </button>
                  ))}
                </div>
              </Card>

              <Card className="flex-1 bg-card/50 p-6">
                {!selected ? (
                  <div className="text-muted-foreground">Select a stream game to view details.</div>
                ) : (
                  <div>
                    <div className="flex items-start justify-between gap-4 mb-6">
                      <div>
                        <h2 className="font-display text-2xl font-bold text-white">{selected.title}</h2>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge className={statusColor(selected.status)}>{selected.status}</Badge>
                          <span className="text-sm text-muted-foreground">
                            {typeLabel(selected.type)}
                          </span>
                        </div>
                      </div>
                      {selected.type === "bonus_hunt" && selected.startingBalance && (
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">Starting Balance</div>
                          <div className="font-display text-xl text-neon-gold">${Number(selected.startingBalance).toLocaleString()}</div>
                        </div>
                      )}
                    </div>

                    {/* Entries */}
                    <div className="mb-8">
                      <h3 className="font-display font-bold mb-3">Entries</h3>
                      <div className="space-y-2">
                        {(selected.entries || []).map((entry) => (
                          <div key={entry.id} className="flex items-center justify-between p-3 rounded bg-white/5">
                            <div>
                              <div className="text-white font-medium">{entry.displayName}</div>
                              <div className="text-sm text-muted-foreground">
                                {entry.slotChoice}{entry.category ? ` • ${entry.category}` : ""}
                              </div>
                            </div>
                            <div className="text-right">
                              <Badge className="bg-white/10 text-muted-foreground">{entry.status}</Badge>
                              {entry.payout && (
                                <div className="text-sm text-neon-gold mt-1">${Number(entry.payout).toLocaleString()}</div>
                              )}
                            </div>
                          </div>
                        ))}
                        {(!selected.entries || selected.entries.length === 0) && (
                          <div className="text-muted-foreground text-sm">No entries yet.</div>
                        )}
                      </div>
                    </div>

                    {/* Tournament bracket */}
                    {selected.type === "tournament" && (
                      <div>
                        <h3 className="font-display font-bold mb-3">Bracket</h3>
                        {bracketsByRound.length === 0 ? (
                          <div className="text-muted-foreground text-sm">Bracket is not generated yet (lock entries in Admin).</div>
                        ) : (
                          <div className="space-y-4">
                            {bracketsByRound.map(([round, matches]) => (
                              <Card key={round} className="bg-white/5 p-4">
                                <div className="font-display font-bold text-white mb-3">Round {round}</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {matches.map((m) => {
                                    const a = m.playerAId ? entryById.get(m.playerAId) : null;
                                    const b = m.playerBId ? entryById.get(m.playerBId) : null;
                                    return (
                                      <div key={m.id} className="p-3 rounded bg-black/20 border border-white/10">
                                        <div className="flex items-center justify-between">
                                          <div className="text-sm text-muted-foreground">Match {m.matchIndex + 1}</div>
                                          <Badge className="bg-white/10 text-muted-foreground">{m.status}</Badge>
                                        </div>
                                        <div className="mt-2 space-y-1">
                                          <div className={`text-white ${m.winnerId === m.playerAId ? "text-neon-gold" : ""}`}>
                                            {a ? a.displayName : "TBD"}
                                          </div>
                                          <div className="text-muted-foreground">vs</div>
                                          <div className={`text-white ${m.winnerId === m.playerBId ? "text-neon-gold" : ""}`}>
                                            {b ? b.displayName : "TBD"}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </Card>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
