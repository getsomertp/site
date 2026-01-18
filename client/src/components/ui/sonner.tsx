"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-xl group-[.toaster]:bg-popover/85 group-[.toaster]:backdrop-blur-xl group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-border/60 group-[.toaster]:shadow-2xl group-[.toaster]:ring-1 group-[.toaster]:ring-white/10",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:rounded-lg group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:border group-[.toast]:border-white/10",
          cancelButton:
            "group-[.toast]:rounded-lg group-[.toast]:bg-muted/50 group-[.toast]:text-foreground group-[.toast]:border group-[.toast]:border-border/60",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
