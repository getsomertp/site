import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Premium defaults:
  // - strong focus ring
  // - consistent sizing
  // - crisp hover/press feedback (via hover-elevate / active-elevate-2 utilities)
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold tracking-tight transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-55 disabled:shadow-none disabled:transform-none select-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0" +
    " hover-elevate active-elevate-2",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border border-white/10 shadow-sm hover:shadow-md active:shadow-sm",
        destructive:
          "bg-destructive text-destructive-foreground border border-destructive-border shadow-sm hover:shadow-md active:shadow-sm",
        outline:
          "bg-transparent border [border-color:var(--button-outline)] shadow-sm hover:shadow-md hover:bg-muted/35 active:shadow-sm",
        secondary:
          "bg-secondary text-secondary-foreground border border-secondary-border shadow-sm hover:shadow-md active:shadow-sm",
        ghost:
          "bg-transparent border border-transparent hover:bg-muted/35 hover:border-border/40",
        link:
          "bg-transparent border border-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-md px-3 text-xs",
        lg: "min-h-10 rounded-lg px-8",
        icon: "h-9 w-9 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
    compoundVariants: [
      // Link buttons should not look like blocks.
      { variant: "link", size: "default", className: "h-auto p-0" },
      { variant: "link", size: "sm", className: "h-auto p-0" },
      { variant: "link", size: "lg", className: "h-auto p-0" },
      { variant: "link", size: "icon", className: "h-auto w-auto p-0" },
    ],
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
