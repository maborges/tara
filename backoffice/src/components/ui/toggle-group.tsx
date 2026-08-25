"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type ToggleGroupContextValue = {
  type: "single" | "multiple"
  value: string | string[] | undefined
  onValueChange?: (value: string | string[]) => void
}

const ToggleGroupContext = React.createContext<ToggleGroupContextValue | null>(null)

function ToggleGroup({
  type,
  value,
  onValueChange,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  type: "single" | "multiple"
  value?: string | string[]
  onValueChange?: (value: string | string[]) => void
}) {
  return (
    <ToggleGroupContext.Provider value={{ type, value, onValueChange }}>
      <div
        data-slot="toggle-group"
        role="group"
        className={cn("inline-flex items-center gap-1", className)}
        {...props}
      >
        {children}
      </div>
    </ToggleGroupContext.Provider>
  )
}

function ToggleGroupItem({
  value,
  className,
  onClick,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const context = React.useContext(ToggleGroupContext)
  const selected = context
    ? context.type === "single"
      ? context.value === value
      : Array.isArray(context.value) && context.value.includes(value)
    : false

  return (
    <button
      type="button"
      data-slot="toggle-group-item"
      aria-pressed={selected}
      className={cn(
        "inline-flex h-8 items-center justify-center rounded-sm border border-primary/20 bg-background px-3 text-sm transition-colors hover:bg-accent hover:text-accent-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground",
        className
      )}
      onClick={(event) => {
        onClick?.(event)
        if (!context) return
        if (context.type === "single") {
          context.onValueChange?.(selected ? "" : value)
          return
        }

        const current = Array.isArray(context.value) ? context.value : []
        const next = selected
          ? current.filter((item) => item !== value)
          : [...current, value]
        context.onValueChange?.(next)
      }}
      {...props}
    >
      {children}
    </button>
  )
}

export { ToggleGroup, ToggleGroupItem }
