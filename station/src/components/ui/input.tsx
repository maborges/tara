import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, autoComplete = "off", ...props }: React.ComponentProps<"input">) {
  const localeProps =
    type === "number"
      ? { inputMode: props.inputMode ?? "decimal", lang: props.lang ?? "pt-BR" }
      : { lang: props.lang ?? "pt-BR" }

  return (
    <input
      type={type}
      autoComplete={autoComplete}
      {...localeProps}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-xl border border-border bg-background px-4 py-2 text-base font-medium transition-all duration-300 outline-none placeholder:text-muted-foreground/50 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 shadow-sm hover:border-primary/50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
