import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy } from "lucide-react";

type WinnerRow = {
  id: number;
  giveawayId: number;
  giveawayTitle: string;
  winnerUserId: number;
  winnerUsername: string;
  pickedAt: string;
};

type Props = {
  limit?: number;
  title?: string;
  emptyText?: string;
  viewAllLabel?: string;
};

export function RecentWinnersMini({
  limit = 3,
  title = "Recent Winners",
  emptyText = "No winners yet.",
  viewAllLabel = "View all",
}: Props) {
  const { data, isLoading } = useQuery<WinnerRow[]>({
    queryKey: ["/api/winners/recent", limit],
    queryFn: async () => {
      const r = await fetch(`/api/winners/recent?limit=${limit}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load winners");
      return r.json();
    },
  });

  return (
    <Card className="glass border-white/10 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-neon-cyan" />
          <div className="text-white font-display font-bold">{title}</div>
        </div>
        <Link href="/winners" className="text-sm text-white/70 hover:text-white">
          {viewAllLabel}
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="text-sm text-white/60">{emptyText}</div>
      ) : (
        <div className="space-y-2">
          {data.map((w) => (
            <div key={w.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="min-w-0">
                <div className="text-sm text-white font-medium truncate">{w.winnerUsername}</div>
                <div className="text-xs text-white/60 truncate">{w.giveawayTitle}</div>
              </div>
              <div className="text-xs text-white/60 shrink-0 ml-3">
                {new Date(w.pickedAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
