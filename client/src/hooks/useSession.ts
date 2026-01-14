import { useQuery } from "@tanstack/react-query";

export type SessionUser = {
  id: string;
  discordId?: string | null;
  discordUsername?: string | null;
  discordAvatar?: string | null;
} | null;

export function useSession() {
  // Session can change without a full reload (e.g., user logs in on another tab).
  // Always revalidate on mount + when window refocuses.
  return useQuery<{ user: SessionUser }>({
    queryKey: ["/api/auth/me"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: false,
  });
}
