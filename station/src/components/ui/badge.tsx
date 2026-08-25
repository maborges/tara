import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "border-primary/20 bg-primary/10 text-primary dark:border-primary/30 dark:bg-primary/15 dark:text-primary [a]:hover:bg-primary/20",
        secondary:
          "border-zinc-200 bg-zinc-100 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 [a]:hover:bg-zinc-200 dark:[a]:hover:bg-zinc-700",
        metadata:
          "border-sky-200 bg-sky-100/45 text-sky-700 [a]:hover:bg-sky-100/65 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-200 dark:[a]:hover:bg-sky-500/20",
        success:
          "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200 [a]:hover:bg-emerald-200 dark:[a]:hover:bg-emerald-500/20",
        info:
          "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 [a]:hover:bg-slate-200 dark:[a]:hover:bg-slate-700",
        warning:
          "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200 [a]:hover:bg-amber-200 dark:[a]:hover:bg-amber-500/20",
        attention:
          "border-orange-200 bg-orange-100 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-200 [a]:hover:bg-orange-200 dark:[a]:hover:bg-orange-500/20",
        danger:
          "border-red-200 bg-red-100 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-200 [a]:hover:bg-red-200 dark:[a]:hover:bg-red-500/20",
        critical:
          "border-red-300 bg-red-200 text-red-900 dark:border-red-500/40 dark:bg-red-500/20 dark:text-red-100 [a]:hover:bg-red-300 dark:[a]:hover:bg-red-500/30",
        priority:
          "border-fuchsia-200 bg-fuchsia-100 text-fuchsia-700 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/15 dark:text-fuchsia-200 [a]:hover:bg-fuchsia-200 dark:[a]:hover:bg-fuchsia-500/20",
        diagnostic:
          "border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-200 [a]:hover:bg-sky-200 dark:[a]:hover:bg-sky-500/20",
        recommendation:
          "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200 [a]:hover:bg-emerald-200 dark:[a]:hover:bg-emerald-500/20",
        destructive:
          "border-destructive/20 bg-destructive/10 text-destructive dark:border-destructive/40 dark:bg-destructive/15 dark:text-destructive-foreground focus-visible:ring-destructive/20 [a]:hover:bg-destructive/20 dark:[a]:hover:bg-destructive/25",
        outline:
          "border-zinc-200 bg-background text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950/50 dark:text-zinc-100 [a]:hover:bg-zinc-100 [a]:hover:text-zinc-900 dark:[a]:hover:bg-zinc-800 dark:[a]:hover:text-zinc-50",
        ghost:
          "border-transparent bg-transparent text-zinc-800 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
