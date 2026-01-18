import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, ShieldCheck, ShieldX } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type GiveawayProof = {
  giveawayId: number;
  title: string;
  endsAt: string;
  entryCount: number;
  entryIds: number[];
  entriesHash: string;
  seedCommitHash: string | null;
  revealedSeed: string | null;
  stored: {
    pfEntriesHash: string | null;
    pfWinnerIndex: number | null;
    pfWinnerEntryId: number | null;
    winnerId: string | null;
  };
  computed: {
    pickHash: string;
    winnerIndex: number;
    winnerEntryId: number | null;
    winnerUserId: string | null;
  } | null;
  ok: boolean;
  winner: null | {
    id: string;
    discordUsername?: string | null;
    kickUsername?: string | null;
    avatarUrl?: string | null;
  };
};

function CodeLine({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs text-white/60">{label}</div>
      <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white/80 break-all">
        {value ?? "—"}
      </div>
    </div>
  );
}

export function ProvablyFairModal({ giveawayId, className }: { giveawayId: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const [showAllEntryIds, setShowAllEntryIds] = useState(false);

  const { data, isLoading, error } = useQuery<GiveawayProof>({
    queryKey: [`/api/giveaways/${giveawayId}/proof`],
    enabled: open,
    // While the modal is open and the seed hasn't been revealed yet,
    // poll so the UI updates immediately after a winner is picked.
    refetchInterval: (query) => {
      const d = query.state.data as GiveawayProof | undefined;
      if (!open) return false;
      if (!d) return 1000;
      return d.revealedSeed ? false : 5000;
    },
  });

  const status = useMemo(() => {
    if (!data) return { label: "Loading", icon: null as any, className: "bg-white/10 text-white/80" };
    if (!data.revealedSeed) return { label: "Pending reveal", icon: null as any, className: "bg-white/10 text-white/80" };
    if (data.ok) return { label: "Verified", icon: ShieldCheck, className: "bg-green-500/15 text-green-300 border border-green-500/30" };
    return { label: "Mismatch", icon: ShieldX, className: "bg-red-500/15 text-red-300 border border-red-500/30" };
  }, [data]);

  const endpoint = `/api/giveaways/${giveawayId}/proof`;

  const prettyJson = useMemo(() => (data ? JSON.stringify(data, null, 2) : ""), [data]);
  const entryIdsPreview = useMemo(() => {
    if (!data?.entryIds?.length) return [] as number[];
    return showAllEntryIds ? data.entryIds : data.entryIds.slice(0, 50);
  }, [data, showAllEntryIds]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={
            className ??
            "font-display text-white/70 hover:text-white border border-white/10 bg-white/0 hover:bg-white/5"
          }
        >
          <ShieldCheck className="h-4 w-4 opacity-80" />
          Provably Fair
        </Button>
      </DialogTrigger>

      <DialogContent className="glass border-white/10 max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="font-display text-2xl text-white">Provably Fair Proof</DialogTitle>
              <div className="text-sm text-white/60 mt-1">
                Verify the winner selection with the commitment hash, revealed seed, and entry list.
              </div>
            </div>
            <Badge className={status.className}>{status.label}</Badge>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            Couldn’t load proof. {String((error as any)?.message || "")}
          </div>
        ) : !data ? (
          <div className="text-sm text-white/70">No proof data.</div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-white/80">
                <span className="text-white/60">Giveaway:</span> <span className="font-display">{data.title}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10 text-white/80 hover:bg-white/5"
                  onClick={() => copy(prettyJson)}
                >
                  <Copy className="h-4 w-4" />
                  Copy JSON
                </Button>

                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="border-white/10 text-white/80 hover:bg-white/5"
                >
                  <a href={endpoint} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Open
                  </a>
                </Button>
              </div>
            </div>

            <Separator className="bg-white/10" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <CodeLine label="Commitment hash (sha256(seed))" value={data.seedCommitHash} />
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-white/60">Revealed seed</div>
                  {data.revealedSeed ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-white/70 hover:bg-white/5"
                      onClick={() => copy(data.revealedSeed || "")}
                    >
                      <Copy className="h-4 w-4" />
                      Copy
                    </Button>
                  ) : null}
                </div>
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white/80 break-all">
                  {data.revealedSeed ?? "— (available after a winner is picked)"}
                </div>
              </div>
              <CodeLine label="Entries hash (sha256(entryIds CSV))" value={data.entriesHash} />
              <CodeLine label="Entry count" value={data.entryCount} />
            </div>

            {data.computed ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <CodeLine label="Pick hash (sha256(seed|giveawayId|entryIds CSV))" value={data.computed.pickHash} />
                <CodeLine label="Winner index (pickHash % entryCount)" value={data.computed.winnerIndex} />
                <CodeLine label="Winner entryId" value={data.computed.winnerEntryId} />
                <CodeLine label="Winner userId" value={data.computed.winnerUserId} />
              </div>
            ) : (
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                Proof will show the computed pick hash and winner index once the giveaway has ended and a winner is selected.
              </div>
            )}

            <Collapsible open={showAllEntryIds} onOpenChange={setShowAllEntryIds}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-white/80">Entry IDs</div>
                {data.entryIds.length > 50 ? (
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-white/70 hover:bg-white/5">
                      {showAllEntryIds ? "Show less" : "Show all"}
                    </Button>
                  </CollapsibleTrigger>
                ) : null}
              </div>

              <div className="mt-2 rounded-lg border border-white/10 bg-white/5">
                <ScrollArea className="h-44">
                  <div className="p-3">
                    <div className="font-mono text-xs text-white/80 break-words">
                      {entryIdsPreview.join(", ") || "—"}
                    </div>
                    <CollapsibleContent>
                      {/* content already handled by preview list; this element keeps radix happy */}
                    </CollapsibleContent>
                  </div>
                </ScrollArea>
              </div>

              <div className="mt-2 text-xs text-white/50">
                The entry order is fixed (sorted by entry id) so the same seed always produces the same winner.
              </div>
            </Collapsible>

            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="w-full border-white/10 text-white/80 hover:bg-white/5">
                  How to verify (manual)
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/70 space-y-2">
                  <div>
                    1) Confirm <span className="text-white">sha256(revealedSeed)</span> equals the commitment hash.
                  </div>
                  <div>
                    2) Join <span className="text-white">entryIds</span> as a comma-separated string, hash it to get the entries hash.
                  </div>
                  <div>
                    3) Compute <span className="text-white">pickHash = sha256(seed|giveawayId|entryIdsCsv)</span>.
                  </div>
                  <div>
                    4) Winner index is <span className="text-white">pickHash (as hex) % entryCount</span>.
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs text-white/80 break-all">
                    seed|giveawayId|entryIdsCsv
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-xs text-white/60">
              Note: “Verified” means the computed winner matches the stored winner for this giveaway.
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
