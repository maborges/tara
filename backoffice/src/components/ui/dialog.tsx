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

type DialogContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}

const DialogContext = React.createContext<DialogContextValue | null>(null)

function useDialogContext() {
  const context = React.useContext(DialogContext)
  if (!context) {
    throw new Error("Dialog components must be used within <Dialog>.")
  }
  return context
}

function Dialog({
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
    <DialogContext.Provider value={{ open: isOpen, setOpen: setIsOpen }}>
      <div data-slot="dialog" {...props}>
        {children}
      </div>
    </DialogContext.Provider>
  )
}

function DialogTrigger({
  render,
  asChild,
  children,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  render?: React.ReactElement
  asChild?: boolean
}) {
  const { setOpen } = useDialogContext()
  const triggerProps = {
    "data-slot": "dialog-trigger",
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

  return (
    <button {...triggerProps}>
      {children}
    </button>
  )
}

function DialogPortal({ children }: { children?: React.ReactNode }) {
  if (typeof document === "undefined") return null
  return createPortal(children, document.body)
}

function DialogClose({
  render,
  asChild,
  children,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  render?: React.ReactElement
  asChild?: boolean
}) {
  const { setOpen } = useDialogContext()
  const closeProps = {
    "data-slot": "dialog-close",
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

  return (
    <button {...closeProps}>
      {children}
    </button>
  )
}

function DialogOverlay({
  className,
  onClick,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { setOpen } = useDialogContext()

  return (
    <div
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      onClick={composeEventHandlers(onClick, () => setOpen(false))}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  showCloseButton?: boolean
}) {
  const { open, setOpen } = useDialogContext()
  const contentRef = React.useRef<HTMLDivElement | null>(null)

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

  React.useEffect(() => {
    if (open) {
      contentRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <DialogPortal>
      <DialogOverlay />
      <div
        ref={contentRef}
        data-slot="dialog-content"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex w-full max-w-md max-h-[calc(100vh-4rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-sm bg-card text-sm text-card-foreground ring-1 ring-border shadow-md gap-6",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogClose
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogClose>
        )}
      </div>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "group/dialog-header @container/dialog-header grid auto-rows-min items-start gap-1 rounded-t-sm px-6 pt-6 [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex items-center rounded-b-sm border-t bg-muted/50 px-6 py-4",
        className
      )}
      {...props}
    >
      <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {children}
        {showCloseButton && (
          <DialogClose render={<Button variant="outline" size="sm" />}>
            Fechar
          </DialogClose>
        )}
      </div>
    </div>
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-title"
      className={cn("text-base font-medium leading-snug tracking-tight", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("min-h-0 flex-1 overflow-y-auto px-6 pb-4", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  DialogBody,
}
