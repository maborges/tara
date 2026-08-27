import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type, autoComplete = "off", ...props }: React.ComponentProps<"input">) {
  return <input type={type} autoComplete={autoComplete} data-slot="input" className={cn("h-8 w-full min-w-0 rounded-sm border border-primary/20 bg-background px-3 py-1 text-sm outline-none placeholder:text-muted-foreground/50 focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/10 disabled:opacity-50", className)} {...props} />;
}
