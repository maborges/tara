"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { ChevronRightIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  cloneElementWithProps,
  composeEventHandlers,
  useControllableState,
} from "./overlay-utils"

type DropdownContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  triggerRef: React.RefObject<HTMLElement | null>
  anchorRect: DOMRect | null
  setAnchorRect: (rect: DOMRect | null) => void
}

const DropdownContext = React.createContext<DropdownContextValue | null>(null)

function useDropdownContext() {
  const context = React.useContext(DropdownContext)
  if (!context) {
    throw new Error("DropdownMenu components must be used within <DropdownMenu>.")
  }
  return context
}

function DropdownMenu({
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
    <DropdownContext.Provider
      value={{
        open: isOpen,
        setOpen: setIsOpen,
        triggerRef,
        anchorRect,
        setAnchorRect,
      }}
    >
      <div data-slot="dropdown-menu" {...props}>
        {children}
      </div>
    </DropdownContext.Provider>
  )
}

function DropdownMenuTrigger({
  render,
  asChild,
  children,
  onClick,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  render?: React.ReactElement
  asChild?: boolean
}) {
  const { open, setOpen, triggerRef, setAnchorRect } = useDropdownContext()
  const setTriggerNode = React.useCallback(
    (node: HTMLElement | null) => {
      triggerRef.current = node
    },
    [triggerRef]
  )

  const triggerProps = {
    "data-slot": "dropdown-menu-trigger",
    "aria-haspopup": "menu",
    "aria-expanded": open,
    ...props,
    onClick: composeEventHandlers(onClick, (event: unknown) => {
      const target = event as React.MouseEvent<HTMLElement>
      const node = target.currentTarget as HTMLElement
      setAnchorRect(node.getBoundingClientRect())
      setOpen(!open)
    }),
  }

  if (render) {
    return cloneElementWithProps(render, { ...triggerProps, ref: setTriggerNode }, children)
  }

  if (asChild && React.isValidElement(children)) {
    return cloneElementWithProps(children, { ...triggerProps, ref: setTriggerNode })
  }

  return (
    <button
      ref={setTriggerNode as React.Ref<HTMLButtonElement>}
      {...(triggerProps as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </button>
  )
}

function DropdownMenuPortal({ children }: { children?: React.ReactNode }) {
  if (typeof document === "undefined") return null
  return createPortal(children, document.body)
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  align = "start",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  sideOffset?: number
  align?: "start" | "end"
}) {
  const { open, setOpen, anchorRect, triggerRef } = useDropdownContext()
  const [placement, setPlacement] = React.useState<"top" | "bottom">("bottom")
  const [availableHeight, setAvailableHeight] = React.useState<number>(0)
  const [horizontalPlacement, setHorizontalPlacement] = React.useState<"start" | "end">(align)

  const updatePlacement = React.useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect() ?? anchorRect
    if (!rect || typeof window === "undefined") return

    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth
    const viewportPadding = 8
    const gap = sideOffset

    const spaceBelow = viewportHeight - rect.bottom - gap - viewportPadding
    const spaceAbove = rect.top - gap - viewportPadding
    const spaceRight = viewportWidth - rect.left - viewportPadding
    const spaceLeft = rect.right - viewportPadding
    const preferredAlign = align
    const nextHorizontalPlacement =
      preferredAlign === "end"
        ? spaceLeft >= rect.width || spaceLeft >= spaceRight
          ? "end"
          : "start"
        : spaceRight >= rect.width || spaceRight >= spaceLeft
          ? "start"
          : "end"

    const nextPlacement = spaceBelow >= spaceAbove ? "bottom" : "top"
    const nextAvailableHeight = Math.max(0, nextPlacement === "bottom" ? spaceBelow : spaceAbove)

    setPlacement(nextPlacement)
    setAvailableHeight(nextAvailableHeight)
    setHorizontalPlacement(nextHorizontalPlacement)
  }, [align, anchorRect, sideOffset, triggerRef])

  React.useEffect(() => {
    if (!open) return
    updatePlacement()

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      const element = document.querySelector('[data-slot="dropdown-menu-content"]')
      if (!target || (element && element.contains(target))) return
      setOpen(false)
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }

    window.addEventListener("pointerdown", handlePointerDown)
    window.addEventListener("keydown", handleEscape)
    window.addEventListener("resize", updatePlacement)
    window.addEventListener("scroll", updatePlacement, true)
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown)
      window.removeEventListener("keydown", handleEscape)
      window.removeEventListener("resize", updatePlacement)
      window.removeEventListener("scroll", updatePlacement, true)
    }
  }, [open, setOpen, updatePlacement])

  if (!open || !anchorRect) return null

  const isEnd = horizontalPlacement === "end"
  const left = isEnd ? undefined : Math.max(8, anchorRect.left)
  const right = isEnd ? Math.max(8, window.innerWidth - anchorRect.right) : undefined
  const contentHeight = availableHeight > 0 ? Math.min(availableHeight, 320) : undefined
  const contentStyle = isEnd
    ? {
        left,
        right,
      }
    : {
        left,
      }

  return (
    <DropdownMenuPortal>
      <div className="fixed inset-0 z-50">
        <div
          data-slot="dropdown-menu-content"
          role="menu"
          className={cn(
            "absolute z-50 min-w-[8rem] overflow-hidden rounded-sm border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-md transition-all",
            className
          )}
          style={{
            top: placement === "bottom" ? anchorRect.bottom + sideOffset : undefined,
            bottom: placement === "top" ? window.innerHeight - anchorRect.top + sideOffset : undefined,
            ...contentStyle,
            minWidth: anchorRect.width,
            maxWidth: "calc(100vw - 16px)",
            maxHeight: contentHeight,
          }}
          {...props}
        >
          <div className="max-h-full overflow-y-auto p-1 outline-none">{children}</div>
        </div>
      </div>
    </DropdownMenuPortal>
  )
}

function DropdownMenuItem({
  className,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { setOpen } = useDropdownContext()

  return (
    <button
      type="button"
      data-slot="dropdown-menu-item"
      role="menuitem"
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus:bg-sidebar-accent focus:text-sidebar-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
      onClick={(event) => {
        onClick?.(event)
        setOpen(false)
      }}
    />
  )
}

function DropdownMenuLabel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dropdown-menu-label"
      className={cn("px-2 py-1.5 text-sm font-semibold", className)}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.HTMLAttributes<HTMLHRElement>) {
  return (
    <hr
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-muted", className)}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuPortal,
}
