import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Action = {
  label: string;
  onClick: () => void;
  variant?: React.ComponentProps<typeof Button>["variant"];
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  withCard = true,
  className,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  primaryAction?: Action;
  secondaryAction?: Action;
  withCard?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const inner = (
    <Empty className="border-white/10 bg-white/5">
      <EmptyHeader>
        {Icon ? (
          <EmptyMedia variant="icon">
            <Icon />
          </EmptyMedia>
        ) : null}
        <EmptyTitle className="font-display text-white">{title}</EmptyTitle>
        {description ? <EmptyDescription className="text-white/60">{description}</EmptyDescription> : null}
      </EmptyHeader>

      {primaryAction || secondaryAction || children ? (
        <EmptyContent>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
            {primaryAction ? (
              <Button
                onClick={primaryAction.onClick}
                className="font-display"
                variant={primaryAction.variant ?? "default"}
              >
                {primaryAction.label}
              </Button>
            ) : null}
            {secondaryAction ? (
              <Button
                onClick={secondaryAction.onClick}
                className="font-display"
                variant={secondaryAction.variant ?? "outline"}
              >
                {secondaryAction.label}
              </Button>
            ) : null}
          </div>
          {children}
        </EmptyContent>
      ) : null}
    </Empty>
  );

  if (!withCard) {
    return <div className={className}>{inner}</div>;
  }

  return <Card className={cn("glass", className)}>{inner}</Card>;
}
