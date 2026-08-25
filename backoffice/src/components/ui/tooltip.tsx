"use client"

import * as React from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"
import {
  cloneElementWithProps,
  composeEventHandlers,
  useControllableState,
} from "./overlay-utils"

type TooltipContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  delay: number
  triggerRef: React.RefObject<HTMLElement | null>
  anchorRect: DOMRect | null
  setAnchorRect: (rect: DOMRect | null) => void
}

const TooltipProviderContext = React.createContext({ delay: 300 })
const TooltipContext = React.createContext<TooltipContextValue | null>(null)

function TooltipProvider({
  delay = 300,
  children,
  ...props
}: React.ComponentProps<"div"> & { delay?: number }) {
  return (
    <TooltipProviderContext.Provider value={{ delay }}>
      <div data-slot="tooltip-provider" {...props}>
        {children}
      </div>
    </TooltipProviderContext.Provider>
  )
}

function Tooltip({
  open,
  defaultOpen = false,
  onOpenChange,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [isOpen, setIsOpen] = useControllableState({
    prop: open,
    defaultProp: defaultOpen,
    onChange: onOpenChange,
  })
  const triggerRef = React.useRef<HTMLElement | null>(null)
  const [anchorRect, setAnchorRectState] = React.useState<DOMRect | null>(null)
  const setAnchorRect = React.useCallback((rect: DOMRect | null) => {
    setAnchorRectState(rect)
  }, [])

  return (
    <TooltipContext.Provider
      value={{
        open: isOpen,
        setOpen: setIsOpen,
        delay: React.useContext(TooltipProviderContext).delay,
        triggerRef,
        anchorRect,
        setAnchorRect,
      }}
    >
      <div data-slot="tooltip" {...props}>
        {children}
      </div>
    </TooltipContext.Provider>
  )
}

function useTooltipContext() {
  const context = React.useContext(TooltipContext)
  if (!context) {
    throw new Error("Tooltip components must be used within <Tooltip>.")
  }
  return context
}

function TooltipTrigger({
  asChild,
  render,
  children,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  asChild?: boolean
  render?: React.ReactElement
}) {
  const { setOpen, delay, triggerRef, setAnchorRect } = useTooltipContext()
  const timeoutRef = React.useRef<number | null>(null)

  const openTooltip = React.useCallback(() => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(() => {
      const node = triggerRef.current
      if (node) {
        setAnchorRect(node.getBoundingClientRect())
        setOpen(true)
      }
    }, delay)
  }, [delay, setAnchorRect, setOpen, triggerRef])

  const closeTooltip = React.useCallback(() => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    setOpen(false)
  }, [setOpen])

  React.useEffect(() => () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
  }, [])

  const triggerProps = {
    "data-slot": "tooltip-trigger",
    ...props,
    onMouseEnter: composeEventHandlers(onMouseEnter, () => openTooltip()),
    onMouseLeave: composeEventHandlers(onMouseLeave, () => closeTooltip()),
    onFocus: composeEventHandlers(onFocus, () => openTooltip()),
    onBlur: composeEventHandlers(onBlur, () => closeTooltip()),
  }

  if (render) {
    return cloneElementWithProps(render, { ...triggerProps, ref: triggerRef }, children)
  }

  if (asChild && React.isValidElement(children)) {
    return cloneElementWithProps(children, { ...triggerProps, ref: triggerRef })
  }

  return (
    <span ref={triggerRef as React.Ref<HTMLSpanElement>} {...triggerProps}>
      {children}
    </span>
  )
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  hidden,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  side?: "top" | "right" | "bottom" | "left"
  sideOffset?: number
  align?: "start" | "center" | "end"
  alignOffset?: number
  hidden?: boolean
}) {
  const { open, anchorRect } = useTooltipContext()

  if (!open || hidden || !anchorRect || typeof document === "undefined") return null

  const common = {
    position: "fixed" as const,
    zIndex: 50,
  }

  let style: React.CSSProperties = {}
  if (side === "top" || side === "bottom") {
    style = {
      ...common,
      top: side === "top" ? anchorRect.top - sideOffset : anchorRect.bottom + sideOffset,
      left:
        align === "start"
          ? anchorRect.left + alignOffset
          : align === "end"
            ? anchorRect.right + alignOffset
            : anchorRect.left + anchorRect.width / 2 + alignOffset,
      transform:
        align === "center"
          ? side === "top"
            ? "translateX(-50%) translateY(-100%)"
            : "translateX(-50%)"
          : undefined,
    }
  } else {
    style = {
      ...common,
      top:
        align === "start"
          ? anchorRect.top + alignOffset
          : align === "end"
            ? anchorRect.bottom + alignOffset
            : anchorRect.top + anchorRect.height / 2 + alignOffset,
      left: side === "left" ? anchorRect.left - sideOffset : anchorRect.right + sideOffset,
      transform:
        align === "center"
          ? side === "left"
            ? "translateX(-100%) translateY(-50%)"
            : "translateY(-50%)"
          : undefined,
    }
  }

  return createPortal(
    <div style={style} className="z-50 pointer-events-none">
      <div
        data-slot="tooltip-content"
        className={cn(
          "inline-flex w-fit max-w-sm items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background shadow-md",
          "animate-in fade-in-0 zoom-in-[0.95] duration-300 ease-out",
          side === "top" && "slide-in-from-bottom-2",
          side === "bottom" && "slide-in-from-top-2",
          side === "left" && "slide-in-from-right-2",
          side === "right" && "slide-in-from-left-2",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
