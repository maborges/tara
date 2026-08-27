import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "success" | "warning" | "destructive" | "outline";
const variants: Record<BadgeVariant, string> = {
  default: "border-primary/20 bg-primary/10 text-primary",
  secondary: "border-border bg-muted text-muted-foreground",
  success: "border-emerald-200 bg-emerald-100 text-emerald-700",
  warning: "border-amber-200 bg-amber-100 text-amber-700",
  destructive: "border-red-200 bg-red-100 text-red-700",
  outline: "border-border bg-background text-foreground",
};

export function Badge({ className, variant = "default", ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return <span data-slot="badge" className={cn("inline-flex h-5 w-fit items-center rounded-sm border px-2 py-0.5 text-xs font-medium", variants[variant], className)} {...props} />;
}
