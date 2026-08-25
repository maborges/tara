"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type TabsContextValue = {
  value?: string
  setValue: (value: string) => void
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

function Tabs({
  className,
  value,
  defaultValue,
  onValueChange,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
}) {
  const [internalValue, setInternalValue] = React.useState(defaultValue)
  const currentValue = value ?? internalValue
  const setValue = (next: string) => {
    onValueChange?.(next)
    if (value === undefined) setInternalValue(next)
  }

  return (
    <TabsContext.Provider value={{ value: currentValue, setValue }}>
      <div data-slot="tabs" className={cn("flex flex-col gap-2", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}

function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="tabs-list"
      role="tablist"
      className={cn("inline-flex items-center justify-center rounded-sm bg-muted p-1 text-muted-foreground", className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  value,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const ctx = React.useContext(TabsContext)
  const selected = ctx?.value === value
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      data-selected={selected ? "" : undefined}
      data-slot="tabs-trigger"
      className={cn("inline-flex h-9 items-center justify-center gap-2 rounded-sm px-3 text-sm md:text-xs font-medium whitespace-nowrap outline-none transition-all duration-200 text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 data-[selected]:bg-accent data-[selected]:text-accent-foreground data-[selected]:font-semibold data-[selected]:shadow-sm data-[selected]:scale-[1.02] focus-visible:ring-3 focus-visible:ring-ring/50", className)}
      onClick={(event) => {
        props.onClick?.(event)
        ctx?.setValue(value)
      }}
      {...props}
    >
      {children}
    </button>
  )
}

function TabsContent({
  className,
  value,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const ctx = React.useContext(TabsContext)
  if (ctx?.value !== value) return null
  return (
    <div data-slot="tabs-content" role="tabpanel" className={cn("mt-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", className)} {...props}>
      {children}
    </div>
  )
}

export { Tabs, TabsContent, TabsList, TabsTrigger }
