import { Badge } from "@/components/ui/badge";
import { BadgeCheck, Clock } from "lucide-react";

export function VerificationBadge({
  verified,
  pendingLabel = "Pending verification",
  verifiedLabel = "Verified",
  size = "default",
}: {
  verified: boolean;
  pendingLabel?: string;
  verifiedLabel?: string;
  size?: "default" | "sm";
}) {
  if (verified) {
    return (
      <Badge className={`gap-1 ${size === "sm" ? "text-xs" : ""}`}>
        <BadgeCheck className="h-3.5 w-3.5" /> {verifiedLabel}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className={`gap-1 ${size === "sm" ? "text-xs" : ""}`}>
      <Clock className="h-3.5 w-3.5" /> {pendingLabel}
    </Badge>
  );
}
