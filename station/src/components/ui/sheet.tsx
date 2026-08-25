"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  cloneElementWithProps,
  composeEventHandlers,
  useControllableState,
} from "./overlay-utils"

type SheetContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}

const SheetContext = React.createContext<SheetContextValue | null>(null)

function useSheetContext() {
  const context = React.useContext(SheetContext)
  if (!context) {
    throw new Error("Sheet components must be used within <Sheet>.")
  }
  return context
}

function Sheet({
  open,
  defaultOpen = false,
  onOpenChange,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [isOpen, setIsOpen] = useControllableState({
    prop: open,
    defaultProp: defaultOpen,
    onChange: onOpenChange,
  })

  return (
    <SheetContext.Provider value={{ open: isOpen, setOpen: setIsOpen }}>
      <div data-slot="sheet" {...props}>
        {children}
      </div>
    </SheetContext.Provider>
  )
}

function SheetTrigger({
  render,
  asChild,
  children,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  render?: React.ReactElement
  asChild?: boolean
}) {
  const { setOpen } = useSheetContext()

  const triggerProps = {
    "data-slot": "sheet-trigger",
    type: "button" as const,
    ...props,
    onClick: composeEventHandlers(onClick, () => setOpen(true)),
  }

  if (render) {
    return cloneElementWithProps(render, triggerProps, children)
  }

  if (asChild && React.isValidElement(children)) {
    return cloneElementWithProps(children, triggerProps)
  }

  return <button {...triggerProps}>{children}</button>
}

function SheetClose({
  render,
  asChild,
  children,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  render?: React.ReactElement
  asChild?: boolean
}) {
  const { setOpen } = useSheetContext()

  const closeProps = {
    "data-slot": "sheet-close",
    type: "button" as const,
    ...props,
    onClick: composeEventHandlers(onClick, () => setOpen(false)),
  }

  if (render) {
    return cloneElementWithProps(render, closeProps, children)
  }

  if (asChild && React.isValidElement(children)) {
    return cloneElementWithProps(children, closeProps)
  }

  return <button {...closeProps}>{children}</button>
}

function SheetPortal({ children }: { children?: React.ReactNode }) {
  if (typeof document === "undefined") return null
  return createPortal(children, document.body)
}

function SheetOverlay({
  className,
  onClick,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { setOpen } = useSheetContext()

  return (
    <div
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      onClick={composeEventHandlers(onClick, () => setOpen(false))}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  const { open, setOpen } = useSheetContext()

  React.useEffect(() => {
    if (!open) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
      }
    }
    window.addEventListener("keydown", handleEscape)
    return () => window.removeEventListener("keydown", handleEscape)
  }, [open, setOpen])

  if (!open) return null

  const sideClasses = {
    top: "inset-x-0 top-0 h-auto border-b",
    right: "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
    bottom: "inset-x-0 bottom-0 h-auto border-t",
    left: "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
  }[side]

  return (
    <SheetPortal>
      <SheetOverlay />
      <div
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-background bg-clip-padding text-sm shadow-lg transition duration-200 ease-in-out",
          sideClasses,
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetClose
            render={
              <Button
                variant="ghost"
                className="absolute top-3 right-3"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </SheetClose>
        )}
      </div>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-title"
      className={cn("text-base font-medium text-foreground", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
