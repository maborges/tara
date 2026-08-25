"use client"

import * as React from "react"

function Collapsible({
  open,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: React.DetailsHTMLAttributes<HTMLDetailsElement> & {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  return (
    <details
      data-slot="collapsible"
      open={open ?? defaultOpen}
      onToggle={(event) => onOpenChange?.((event.currentTarget as HTMLDetailsElement).open)}
      {...props}
    >
      {children}
    </details>
  )
}

function CollapsibleTrigger({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <summary data-slot="collapsible-trigger" {...props}>
      {children}
    </summary>
  )
}

function CollapsibleContent({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-slot="collapsible-content" {...props}>
      {children}
    </div>
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
