import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Play, Lock, Swords, Target, DollarSign, Check, X, Crown, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { StreamEvent, StreamEventEntry, TournamentBracket } from "@shared/schema";

type AdminFetch = (url: string, options?: RequestInit) => Promise<any>;

type StreamEventWithDetails = StreamEvent & {
  entries: StreamEventEntry[];
  brackets: TournamentBracket[];
};

interface StreamEventsProps {
  adminFetch: AdminFetch;
}

export function StreamEvents({ adminFetch }: StreamEventsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeGame, setActiveGame] = useState("tournament");
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [payoutEntryId, setPayoutEntryId] = useState<number | null>(null);
  const [payoutAmount, setPayoutAmount] = useState("");

  const [newEventForm, setNewEventForm] = useState({
    title: "",
    maxPlayers: 8,
    startingBalance: "",
  });

  const [newEntryForm, setNewEntryForm] = useState({
    displayName: "",
    slotChoice: "",
    category: "regular",
  });

  const { data: events = [], isLoading } = useQuery<StreamEventWithDetails[]>({
    queryKey: ["/api/admin/stream-events"],
    queryFn: () => adminFetch("/api/admin/stream-events"),
  });

  const filteredEvents = events.filter((e) => e.type === activeGame);
  const selectedEvent = events.find((e) => e.id === selectedEventId);

  const createEvent = useMutation({
    mutationFn: async (type: string) => {
      const data: any = {
        type,
        title: newEventForm.title,
        status: "draft",
      };
      if (type === "tournament") {
        data.maxPlayers = newEventForm.maxPlayers;
      } else if (type === "bonus_hunt") {
        data.startingBalance = newEventForm.startingBalance;
      }
      return adminFetch("/api/admin/stream-events", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (newEvent) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stream-events"] });
      setCreateDialogOpen(false);
      setNewEventForm({ title: "", maxPlayers: 8, startingBalance: "" });
      setSelectedEventId(newEvent.id);
      toast({ title: "Event created!" });
    },
    onError: () => {
      toast({ title: "Failed to create event", variant: "destructive" });
    },
  });

  const updateEvent = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      return adminFetch(`/api/admin/stream-events/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stream-events"] });
      toast({ title: "Event updated!" });
    },
  });

  const lockEvent = useMutation({
    mutationFn: async (id: number) => {
      return adminFetch(`/api/admin/stream-events/${id}/lock`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stream-events"] });
      toast({ title: "Entries locked and randomized!" });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const startEvent = useMutation({
    mutationFn: async (id: number) => {
      return adminFetch(`/api/admin/stream-events/${id}/start`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stream-events"] });
      toast({ title: "Event started!" });
    },
  });

  const completeEvent = useMutation({
    mutationFn: async (id: number) => {
      return adminFetch(`/api/admin/stream-events/${id}/complete`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stream-events"] });
      toast({ title: "Event completed!" });
    },
  });

  const deleteEvent = useMutation({
    mutationFn: async (id: number) => {
      return adminFetch(`/api/admin/stream-events/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stream-events"] });
      setSelectedEventId(null);
      toast({ title: "Event deleted!" });
    },
  });

  const addEntry = useMutation({
    mutationFn: async (eventId: number) => {
      return adminFetch(`/api/admin/stream-events/${eventId}/entries`, {
        method: "POST",
        body: JSON.stringify(newEntryForm),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stream-events"] });
      setEntryDialogOpen(false);
      setNewEntryForm({ displayName: "", slotChoice: "", category: "regular" });
      toast({ title: "Entry added!" });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const deleteEntry = useMutation({
    mutationFn: async ({ eventId, entryId }: { eventId: number; entryId: number }) => {
      return adminFetch(`/api/admin/stream-events/${eventId}/entries/${entryId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stream-events"] });
      toast({ title: "Entry removed!" });
    },
  });

  const markBonused = useMutation({
    mutationFn: async (id: number) => {
      return adminFetch(`/api/admin/stream-events/${id}/bonus/bonused`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stream-events"] });
      toast({ title: "Marked as bonused!" });
    },
  });

  const markNoBonus = useMutation({
    mutationFn: async (id: number) => {
      return adminFetch(`/api/admin/stream-events/${id}/bonus/no-bonus`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stream-events"] });
    },
  });

  const updateBracketWinner = useMutation({
    mutationFn: async ({ eventId, bracketId, winnerId }: { eventId: number; bracketId: number; winnerId: number }) => {
      return adminFetch(`/api/admin/stream-events/${eventId}/brackets/${bracketId}`, {
        method: "PATCH",
        body: JSON.stringify({ winnerId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stream-events"] });
      toast({ title: "Winner recorded!" });
    },
  });

  const updatePayout = useMutation({
    mutationFn: async ({ eventId, entryId, payout }: { eventId: number; entryId: number; payout: string }) => {
      return adminFetch(`/api/admin/stream-events/${eventId}/entries/${entryId}/payout`, {
        method: "PATCH",
        body: JSON.stringify({ payout: parseFloat(payout) }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stream-events"] });
      setPayoutEntryId(null);
      setPayoutAmount("");
      toast({ title: "Payout recorded!" });
    },
  });

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "draft": return "bg-gray-500/20 text-gray-400";
      case "open": return "bg-green-500/20 text-green-400";
      case "locked": return "bg-yellow-500/20 text-yellow-400";
      case "in_progress": return "bg-blue-500/20 text-blue-400";
      case "completed": return "bg-purple-500/20 text-purple-400";
      default: return "bg-gray-500/20 text-gray-400";
    }
  };

  const renderTournamentBracket = (event: StreamEventWithDetails) => {
    const brackets = event.brackets;
    if (!brackets.length) {
      return <p className="text-muted-foreground">Bracket will be generated when entries are locked</p>;
    }

    const rounds: { [key: number]: TournamentBracket[] } = {};
    brackets.forEach((b) => {
      if (!rounds[b.round]) rounds[b.round] = [];
      rounds[b.round].push(b);
    });

    const getPlayerName = (playerId: number | null) => {
      if (!playerId) return "TBD";
      const entry = event.entries.find((e) => e.id === playerId);
      return entry ? `${entry.displayName} - ${entry.slotChoice}` : "Unknown";
    };

    return (
      <div className="flex gap-8 overflow-x-auto py-4">
        {Object.keys(rounds)
          .sort((a, b) => Number(a) - Number(b))
          .map((round) => (
            <div key={round} className="flex flex-col gap-4">
              <h4 className="text-sm font-bold text-center text-muted-foreground">
                {Number(round) === Object.keys(rounds).length ? "Final" : `Round ${round}`}
              </h4>
              {rounds[Number(round)]
                .sort((a, b) => a.matchIndex - b.matchIndex)
                .map((match) => (
                  <Card key={match.id} className="bg-white/5 p-3 min-w-[200px]" data-testid={`bracket-match-${match.id}`}>
                    <div className="space-y-2">
                      <div
                        className={`flex items-center justify-between p-2 rounded ${
                          match.winnerId === match.playerAId ? "bg-green-500/20 border border-green-500/50" : "bg-white/5"
                        }`}
                      >
                        <span className="text-sm truncate flex-1">{getPlayerName(match.playerAId)}</span>
                        {match.status !== "resolved" && match.playerAId && match.playerBId && event.status === "in_progress" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ml-2 h-6 px-2 text-green-400 hover:text-green-300"
                            onClick={() =>
                              updateBracketWinner.mutate({
                                eventId: event.id,
                                bracketId: match.id,
                                winnerId: match.playerAId!,
                              })
                            }
                            data-testid={`button-winner-${match.id}-a`}
                          >
                            <Crown className="w-4 h-4" />
                          </Button>
                        )}
                        {match.winnerId === match.playerAId && <Crown className="w-4 h-4 text-yellow-400" />}
                      </div>
                      <div className="text-center text-xs text-muted-foreground">vs</div>
                      <div
                        className={`flex items-center justify-between p-2 rounded ${
                          match.winnerId === match.playerBId ? "bg-green-500/20 border border-green-500/50" : "bg-white/5"
                        }`}
                      >
                        <span className="text-sm truncate flex-1">{getPlayerName(match.playerBId)}</span>
                        {match.status !== "resolved" && match.playerAId && match.playerBId && event.status === "in_progress" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ml-2 h-6 px-2 text-green-400 hover:text-green-300"
                            onClick={() =>
                              updateBracketWinner.mutate({
                                eventId: event.id,
                                bracketId: match.id,
                                winnerId: match.playerBId!,
                              })
                            }
                            data-testid={`button-winner-${match.id}-b`}
                          >
                            <Crown className="w-4 h-4" />
                          </Button>
                        )}
                        {match.winnerId === match.playerBId && <Crown className="w-4 h-4 text-yellow-400" />}
                      </div>
                    </div>
                  </Card>
                ))}
            </div>
          ))}
      </div>
    );
  };

  const renderBonusHunt = (event: StreamEventWithDetails) => {
    const waiting = event.entries.filter((e) => e.status === "waiting");
    const current = event.entries.find((e) => e.status === "current");
    const bonused = event.entries.filter((e) => e.status === "bonused");
    const totalPayout = bonused.reduce((sum, e) => sum + parseFloat(e.payout || "0"), 0);
    const startingBalance = parseFloat(event.startingBalance || "0");

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-white/5 p-4 text-center">
            <div className="text-sm text-muted-foreground">Starting Balance</div>
            <div className="text-2xl font-bold text-neon-gold">${startingBalance.toFixed(2)}</div>
          </Card>
          <Card className="bg-white/5 p-4 text-center">
            <div className="text-sm text-muted-foreground">Total Payout</div>
            <div className="text-2xl font-bold text-green-400">${totalPayout.toFixed(2)}</div>
          </Card>
          <Card className="bg-white/5 p-4 text-center">
            <div className="text-sm text-muted-foreground">Profit/Loss</div>
            <div className={`text-2xl font-bold ${totalPayout - startingBalance >= 0 ? "text-green-400" : "text-red-400"}`}>
              ${(totalPayout - startingBalance).toFixed(2)}
            </div>
          </Card>
        </div>

        {current && (event.status === "locked" || event.status === "in_progress") && (
          <Card className="bg-neon-purple/20 border-neon-purple/50 p-6">
            <h4 className="text-lg font-bold text-white mb-2">Currently Playing</h4>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xl font-display text-neon-gold">{current.slotChoice}</div>
                <div className="text-sm text-muted-foreground">Called by: {current.displayName}</div>
              </div>
              <div className="flex gap-2">
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => markBonused.mutate(event.id)}
                  disabled={markBonused.isPending}
                  data-testid="button-bonused"
                >
                  <Check className="w-4 h-4 mr-2" /> Bonused
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => markNoBonus.mutate(event.id)}
                  disabled={markNoBonus.isPending}
                  data-testid="button-no-bonus"
                >
                  <X className="w-4 h-4 mr-2" /> No Bonus
                </Button>
              </div>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-6">
          <div>
            <h4 className="font-display text-lg font-bold text-white mb-3">
              Waiting ({waiting.length})
            </h4>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {waiting.map((entry) => (
                <Card key={entry.id} className="bg-white/5 p-3" data-testid={`waiting-entry-${entry.id}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{entry.slotChoice}</div>
                      <div className="text-xs text-muted-foreground">{entry.displayName}</div>
                    </div>
                  </div>
                </Card>
              ))}
              {waiting.length === 0 && <p className="text-muted-foreground text-sm">No more slots waiting</p>}
            </div>
          </div>

          <div>
            <h4 className="font-display text-lg font-bold text-white mb-3">
              Bonuses ({bonused.length})
            </h4>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {bonused.map((entry) => (
                <Card key={entry.id} className="bg-green-500/10 border-green-500/30 p-3" data-testid={`bonused-entry-${entry.id}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{entry.slotChoice}</div>
                      <div className="text-xs text-muted-foreground">{entry.displayName}</div>
                    </div>
                    {payoutEntryId === entry.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={payoutAmount}
                          onChange={(e) => setPayoutAmount(e.target.value)}
                          className="w-24 h-8 bg-white/10"
                          data-testid={`input-payout-${entry.id}`}
                        />
                        <Button
                          size="sm"
                          className="h-8"
                          onClick={() => {
                            if (payoutAmount) {
                              updatePayout.mutate({ eventId: event.id, entryId: entry.id, payout: payoutAmount });
                            }
                          }}
                          data-testid={`button-save-payout-${entry.id}`}
                        >
                          Save
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-neon-gold"
                        onClick={() => {
                          setPayoutEntryId(entry.id);
                          setPayoutAmount(entry.payout || "");
                        }}
                        data-testid={`button-edit-payout-${entry.id}`}
                      >
                        {entry.payout ? `$${parseFloat(entry.payout).toFixed(2)}` : "Add Payout"}
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
              {bonused.length === 0 && <p className="text-muted-foreground text-sm">No bonuses yet</p>}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeGame} onValueChange={setActiveGame}>
        <TabsList className="grid w-full grid-cols-3 bg-card/50">
          <TabsTrigger value="tournament" className="font-display" data-testid="tab-tournament">
            <Swords className="w-4 h-4 mr-2" /> Tournament
          </TabsTrigger>
          <TabsTrigger value="bonus_hunt" className="font-display" data-testid="tab-bonus-hunt">
            <Target className="w-4 h-4 mr-2" /> Bonus Hunt
          </TabsTrigger>
          <TabsTrigger value="guess_balance" className="font-display" data-testid="tab-guess-balance">
            <DollarSign className="w-4 h-4 mr-2" /> Guess Balance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tournament" className="mt-6">
          <div className="flex gap-6">
            <Card className="w-72 bg-card/50 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-bold">Tournaments</h3>
                <Dialog open={createDialogOpen && activeGame === "tournament"} onOpenChange={setCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-neon-purple hover:bg-neon-purple/80" data-testid="button-new-tournament">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="glass border-white/10">
                    <DialogHeader>
                      <DialogTitle className="font-display">New Tournament</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label>Title</Label>
                        <Input
                          value={newEventForm.title}
                          onChange={(e) => setNewEventForm({ ...newEventForm, title: e.target.value })}
                          placeholder="Stream Tournament #1"
                          className="bg-white/5"
                          data-testid="input-tournament-title"
                        />
                      </div>
                      <div>
                        <Label>Number of Players</Label>
                        <Select
                          value={String(newEventForm.maxPlayers)}
                          onValueChange={(v) => setNewEventForm({ ...newEventForm, maxPlayers: parseInt(v) })}
                        >
                          <SelectTrigger className="bg-white/5" data-testid="select-tournament-players">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="4">4 Players</SelectItem>
                            <SelectItem value="8">8 Players</SelectItem>
                            <SelectItem value="16">16 Players</SelectItem>
                            <SelectItem value="32">32 Players</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        className="w-full bg-neon-purple hover:bg-neon-purple/80"
                        onClick={() => createEvent.mutate("tournament")}
                        disabled={!newEventForm.title || createEvent.isPending}
                        data-testid="button-create-tournament"
                      >
                        Create Tournament
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="space-y-2">
                {filteredEvents.map((event) => (
                  <Card
                    key={event.id}
                    className={`p-3 cursor-pointer transition-colors ${
                      selectedEventId === event.id ? "bg-neon-purple/20 border-neon-purple/50" : "bg-white/5 hover:bg-white/10"
                    }`}
                    onClick={() => setSelectedEventId(event.id)}
                    data-testid={`event-card-${event.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="truncate flex-1">
                        <div className="font-medium truncate">{event.title}</div>
                        <div className="text-xs text-muted-foreground">{event.maxPlayers} players</div>
                      </div>
                      <Badge className={getStatusBadgeColor(event.status)}>{event.status}</Badge>
                    </div>
                  </Card>
                ))}
                {filteredEvents.length === 0 && (
                  <p className="text-muted-foreground text-sm text-center py-4">No tournaments yet</p>
                )}
              </div>
            </Card>

            <Card className="flex-1 bg-card/50 p-6">
              {selectedEvent && selectedEvent.type === "tournament" ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-display text-2xl font-bold">{selectedEvent.title}</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={getStatusBadgeColor(selectedEvent.status)}>{selectedEvent.status}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {selectedEvent.entries.length} / {selectedEvent.maxPlayers} entries
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {selectedEvent.status === "draft" && (
                        <Button
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => updateEvent.mutate({ id: selectedEvent.id, status: "open" })}
                          data-testid="button-open-entries"
                        >
                          Open Entries
                        </Button>
                      )}
                      {selectedEvent.status === "open" && (
                        <Button
                          className="bg-yellow-600 hover:bg-yellow-700"
                          onClick={() => lockEvent.mutate(selectedEvent.id)}
                          disabled={selectedEvent.entries.length === 0}
                          data-testid="button-lock-entries"
                        >
                          <Lock className="w-4 h-4 mr-2" /> Lock & Randomize
                        </Button>
                      )}
                      {selectedEvent.status === "locked" && (
                        <Button
                          className="bg-blue-600 hover:bg-blue-700"
                          onClick={() => startEvent.mutate(selectedEvent.id)}
                          data-testid="button-start-tournament"
                        >
                          <Play className="w-4 h-4 mr-2" /> Start
                        </Button>
                      )}
                      {selectedEvent.status === "in_progress" && (
                        <Button
                          className="bg-purple-600 hover:bg-purple-700"
                          onClick={() => completeEvent.mutate(selectedEvent.id)}
                          data-testid="button-complete-tournament"
                        >
                          Complete
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        onClick={() => deleteEvent.mutate(selectedEvent.id)}
                        data-testid="button-delete-event"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {selectedEvent.status === "open" && (
                    <Card className="bg-white/5 p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-display font-bold">Entries</h3>
                        <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
                          <DialogTrigger asChild>
                            <Button size="sm" className="bg-neon-cyan hover:bg-neon-cyan/80" data-testid="button-add-entry">
                              <Plus className="w-4 h-4 mr-1" /> Add Entry
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="glass border-white/10">
                            <DialogHeader>
                              <DialogTitle className="font-display">Add Entry</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div>
                                <Label>Player Name</Label>
                                <Input
                                  value={newEntryForm.displayName}
                                  onChange={(e) => setNewEntryForm({ ...newEntryForm, displayName: e.target.value })}
                                  placeholder="StreamerName123"
                                  className="bg-white/5"
                                  data-testid="input-entry-name"
                                />
                              </div>
                              <div>
                                <Label>Slot Choice</Label>
                                <Input
                                  value={newEntryForm.slotChoice}
                                  onChange={(e) => setNewEntryForm({ ...newEntryForm, slotChoice: e.target.value })}
                                  placeholder="Gates of Olympus"
                                  className="bg-white/5"
                                  data-testid="input-entry-slot"
                                />
                              </div>
                              <div>
                                <Label>Category</Label>
                                <Select
                                  value={newEntryForm.category}
                                  onValueChange={(v) => setNewEntryForm({ ...newEntryForm, category: v })}
                                >
                                  <SelectTrigger className="bg-white/5" data-testid="select-entry-category">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="super">Super</SelectItem>
                                    <SelectItem value="regular">Regular</SelectItem>
                                    <SelectItem value="middle">Middle</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <Button
                                className="w-full bg-neon-cyan hover:bg-neon-cyan/80"
                                onClick={() => addEntry.mutate(selectedEvent.id)}
                                disabled={!newEntryForm.displayName || !newEntryForm.slotChoice || addEntry.isPending}
                                data-testid="button-submit-entry"
                              >
                                Add Entry
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <div className="space-y-2">
                        {selectedEvent.entries.map((entry) => (
                          <div
                            key={entry.id}
                            className="flex items-center justify-between p-2 rounded bg-white/5"
                            data-testid={`entry-${entry.id}`}
                          >
                            <div className="flex items-center gap-3">
                              <User className="w-4 h-4 text-muted-foreground" />
                              <div>
                                <div className="font-medium">{entry.displayName}</div>
                                <div className="text-sm text-muted-foreground">
                                  {entry.slotChoice} - <span className="capitalize">{entry.category}</span>
                                </div>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-400 hover:text-red-300"
                              onClick={() => deleteEntry.mutate({ eventId: selectedEvent.id, entryId: entry.id })}
                              data-testid={`button-delete-entry-${entry.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                        {selectedEvent.entries.length === 0 && (
                          <p className="text-muted-foreground text-sm text-center py-2">No entries yet</p>
                        )}
                      </div>
                    </Card>
                  )}

                  {(selectedEvent.status === "locked" || selectedEvent.status === "in_progress" || selectedEvent.status === "completed") && (
                    <div>
                      <h3 className="font-display font-bold mb-4">Tournament Bracket</h3>
                      {renderTournamentBracket(selectedEvent)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                  Select a tournament to view details
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="bonus_hunt" className="mt-6">
          <div className="flex gap-6">
            <Card className="w-72 bg-card/50 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-bold">Bonus Hunts</h3>
                <Dialog open={createDialogOpen && activeGame === "bonus_hunt"} onOpenChange={setCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-neon-gold hover:bg-neon-gold/80 text-black" data-testid="button-new-bonus-hunt">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="glass border-white/10">
                    <DialogHeader>
                      <DialogTitle className="font-display">New Bonus Hunt</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label>Title</Label>
                        <Input
                          value={newEventForm.title}
                          onChange={(e) => setNewEventForm({ ...newEventForm, title: e.target.value })}
                          placeholder="Saturday Bonus Hunt"
                          className="bg-white/5"
                          data-testid="input-bonus-hunt-title"
                        />
                      </div>
                      <div>
                        <Label>Starting Balance ($)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={newEventForm.startingBalance}
                          onChange={(e) => setNewEventForm({ ...newEventForm, startingBalance: e.target.value })}
                          placeholder="1000.00"
                          className="bg-white/5"
                          data-testid="input-starting-balance"
                        />
                      </div>
                      <Button
                        className="w-full bg-neon-gold hover:bg-neon-gold/80 text-black"
                        onClick={() => createEvent.mutate("bonus_hunt")}
                        disabled={!newEventForm.title || !newEventForm.startingBalance || createEvent.isPending}
                        data-testid="button-create-bonus-hunt"
                      >
                        Create Bonus Hunt
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="space-y-2">
                {filteredEvents.map((event) => (
                  <Card
                    key={event.id}
                    className={`p-3 cursor-pointer transition-colors ${
                      selectedEventId === event.id ? "bg-neon-gold/20 border-neon-gold/50" : "bg-white/5 hover:bg-white/10"
                    }`}
                    onClick={() => setSelectedEventId(event.id)}
                    data-testid={`event-card-${event.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="truncate flex-1">
                        <div className="font-medium truncate">{event.title}</div>
                        <div className="text-xs text-muted-foreground">
                          ${parseFloat(event.startingBalance || "0").toFixed(2)}
                        </div>
                      </div>
                      <Badge className={getStatusBadgeColor(event.status)}>{event.status}</Badge>
                    </div>
                  </Card>
                ))}
                {filteredEvents.length === 0 && (
                  <p className="text-muted-foreground text-sm text-center py-4">No bonus hunts yet</p>
                )}
              </div>
            </Card>

            <Card className="flex-1 bg-card/50 p-6">
              {selectedEvent && selectedEvent.type === "bonus_hunt" ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-display text-2xl font-bold">{selectedEvent.title}</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={getStatusBadgeColor(selectedEvent.status)}>{selectedEvent.status}</Badge>
                        <span className="text-sm text-muted-foreground">{selectedEvent.entries.length} slots entered</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {selectedEvent.status === "draft" && (
                        <Button
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => updateEvent.mutate({ id: selectedEvent.id, status: "open" })}
                          data-testid="button-open-hunt"
                        >
                          Open Entries
                        </Button>
                      )}
                      {selectedEvent.status === "open" && (
                        <Button
                          className="bg-yellow-600 hover:bg-yellow-700"
                          onClick={() => lockEvent.mutate(selectedEvent.id)}
                          disabled={selectedEvent.entries.length === 0}
                          data-testid="button-lock-hunt"
                        >
                          <Lock className="w-4 h-4 mr-2" /> Lock & Start Hunt
                        </Button>
                      )}
                      {(selectedEvent.status === "locked" || selectedEvent.status === "in_progress") && (
                        <Button
                          className="bg-purple-600 hover:bg-purple-700"
                          onClick={() => completeEvent.mutate(selectedEvent.id)}
                          data-testid="button-complete-hunt"
                        >
                          Complete Hunt
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        onClick={() => deleteEvent.mutate(selectedEvent.id)}
                        data-testid="button-delete-hunt"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {selectedEvent.status === "open" && (
                    <Card className="bg-white/5 p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-display font-bold">Slot Entries</h3>
                        <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
                          <DialogTrigger asChild>
                            <Button size="sm" className="bg-neon-cyan hover:bg-neon-cyan/80" data-testid="button-add-slot">
                              <Plus className="w-4 h-4 mr-1" /> Add Slot
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="glass border-white/10">
                            <DialogHeader>
                              <DialogTitle className="font-display">Add Slot Entry</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div>
                                <Label>Called By</Label>
                                <Input
                                  value={newEntryForm.displayName}
                                  onChange={(e) => setNewEntryForm({ ...newEntryForm, displayName: e.target.value })}
                                  placeholder="ViewerName123"
                                  className="bg-white/5"
                                  data-testid="input-caller-name"
                                />
                              </div>
                              <div>
                                <Label>Slot Name</Label>
                                <Input
                                  value={newEntryForm.slotChoice}
                                  onChange={(e) => setNewEntryForm({ ...newEntryForm, slotChoice: e.target.value })}
                                  placeholder="Sweet Bonanza"
                                  className="bg-white/5"
                                  data-testid="input-slot-name"
                                />
                              </div>
                              <Button
                                className="w-full bg-neon-cyan hover:bg-neon-cyan/80"
                                onClick={() => addEntry.mutate(selectedEvent.id)}
                                disabled={!newEntryForm.displayName || !newEntryForm.slotChoice || addEntry.isPending}
                                data-testid="button-submit-slot"
                              >
                                Add Slot
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <div className="space-y-2">
                        {selectedEvent.entries.map((entry) => (
                          <div
                            key={entry.id}
                            className="flex items-center justify-between p-2 rounded bg-white/5"
                            data-testid={`slot-entry-${entry.id}`}
                          >
                            <div>
                              <div className="font-medium">{entry.slotChoice}</div>
                              <div className="text-xs text-muted-foreground">by {entry.displayName}</div>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-400 hover:text-red-300"
                              onClick={() => deleteEntry.mutate({ eventId: selectedEvent.id, entryId: entry.id })}
                              data-testid={`button-delete-slot-${entry.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                        {selectedEvent.entries.length === 0 && (
                          <p className="text-muted-foreground text-sm text-center py-2">No slots entered yet</p>
                        )}
                      </div>
                    </Card>
                  )}

                  {(selectedEvent.status === "locked" || selectedEvent.status === "in_progress" || selectedEvent.status === "completed") &&
                    renderBonusHunt(selectedEvent)}
                </div>
              ) : (
                <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                  Select a bonus hunt to view details
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="guess_balance" className="mt-6">
          <Card className="bg-card/50 p-12">
            <div className="text-center">
              <DollarSign className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-display text-xl font-bold text-white mb-2">Guess the Balance</h3>
              <p className="text-muted-foreground">Coming soon! This game mode is under development.</p>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
