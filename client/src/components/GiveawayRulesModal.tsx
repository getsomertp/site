import { Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Props = {
  triggerText?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  className?: string;
};

/**
 * A simple, global rules modal. Keep copy high-level to avoid legal/region-specific promises.
 */
export function GiveawayRulesModal({
  triggerText = "Giveaway Rules",
  variant = "outline",
  className,
}: Props) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={variant} className={className}>
          <Info className="h-4 w-4 mr-2 opacity-80" />
          {triggerText}
        </Button>
      </DialogTrigger>

      <DialogContent className="glass border-white/10 max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-white">Giveaway Rules</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm text-white/80 leading-relaxed">
          <p className="text-white/70">
            These are the general rules for giveaways on GETSOME. Some giveaways may add extra requirements shown on the giveaway card.
          </p>

          <ul className="list-disc pl-5 space-y-2">
            <li>
              <span className="text-white">One entry per giveaway per Discord account.</span> Duplicate entries are blocked.
            </li>
            <li>
              <span className="text-white">You must be logged in with Discord</span> to enter and track entries.
            </li>
            <li>
              Some giveaways require a <span className="text-white">linked casino account</span> (and sometimes a
              <span className="text-white"> verified</span> link). If required, you’ll be prompted to link it in your Profile.
            </li>
            <li>
              Winners are selected from <span className="text-white">valid entries</span> after the giveaway ends and will be displayed on the site.
            </li>
            <li>
              You must meet <span className="text-white">legal age</span> requirements and comply with any partner terms.
            </li>
            <li>
              If needed, we may request reasonable info to confirm eligibility before issuing prizes.
            </li>
          </ul>

          <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-white/70">
            <div className="font-display text-white mb-1">Heads up</div>
            Giveaway details (end time, prize, requirements) are shown on each giveaway card and may vary.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
