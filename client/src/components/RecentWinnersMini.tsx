import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Sparkles } from "lucide-react";
import { getQueryFn } from "@/lib/queryClient";

type WinnerSummary = {
  id: string;
  discordUsername?: string | null;
  discordAvatarUrl?: string | null;
  kickUsername?: string | null;
};

type WinnerPayload = {
  id: number;
  title: string;
  prize: string;
  endsAt: string | Date;
  casino?: { id: number; name: string; slug: string; logo?: string | null } | null;
  winner: WinnerSummary;
};

function initials(name: string) {
  const cleaned = String(name || "W").trim();
  if (!cleaned) return "W";
  return cleaned.slice(0, 2).toUpperCase();
}

export function RecentWinnersMini({ limit = 3 }: { limit?: number }) {
  const { data: winners = [] } = useQuery<WinnerPayload[]>({
    queryKey: ["/api/giveaways/winners", limit],
    queryFn: async () => {
      const fn = getQueryFn({ on401: "returnNull" });
      const res = await fn({ queryKey: [`/api/giveaways/winners?limit=${limit}`] } as any);
      return Array.isArray(res) ? res : [];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  if (!winners || winners.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center gap-2 text-white mb-2">
          <Sparkles className="h-4 w-4 text-neon-gold" />
          <span className="font-display text-sm uppercase tracking-wider text-white/80">Recent Winners</span>
        </div>
        <div className="text-sm text-white/60">No winners yet.</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-2 text-white">
          <Sparkles className="h-4 w-4 text-neon-gold" />
          <span className="font-display text-sm uppercase tracking-wider text-white/80">Recent Winners</span>
        </div>
        <Link href="/winners">
          <span className="text-xs text-white/60 hover:text-white cursor-pointer">View all</span>
        </Link>
      </div>

      <div className="space-y-2">
        {winners.slice(0, limit).map((w) => {
          const name = w?.winner?.discordUsername || w?.winner?.kickUsername || "Winner";
          const avatar = w?.winner?.discordAvatarUrl || null;
          return (
            <div key={w.id} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {avatar ? (
                  <img loading="lazy" decoding="async"
                    src={avatar}
                    alt=""
                    className="w-8 h-8 rounded-full border border-white/10"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-xs text-white">
                    {initials(name)}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-sm text-white font-display font-bold truncate">{name}</div>
                  <div className="text-xs text-white/55 truncate">{w.title}</div>
                </div>
              </div>
              <div className="text-sm font-display font-bold text-neon-gold whitespace-nowrap">{w.prize}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
