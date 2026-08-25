"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { ChevronDownIcon, CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  cloneElementWithProps,
  composeEventHandlers,
  useControllableState,
} from "./overlay-utils"

type SelectContextValue = {
  value?: string
  setValue: (value: string) => void
  open: boolean
  setOpen: (open: boolean) => void
  disabled?: boolean
  triggerRef: React.RefObject<HTMLButtonElement | null>
  anchorRect: DOMRect | null
  setAnchorRect: (rect: DOMRect | null) => void
  labels: React.MutableRefObject<Map<string, string>>
  children?: React.ReactNode
}

const SelectContext = React.createContext<SelectContextValue | null>(null)

function useSelectContext() {
  const context = React.useContext(SelectContext)
  if (!context) {
    throw new Error("Select components must be used within <Select>.")
  }
  return context
}

function Select({
  value,
  defaultValue,
  onValueChange,
  open,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
}) {
  const [selected, setSelected] = useControllableState({
    prop: value,
    defaultProp: defaultValue ?? "",
    onChange: onValueChange,
  })
  const [isOpen, setIsOpen] = useControllableState({
    prop: open,
    defaultProp: defaultOpen,
    onChange: onOpenChange,
  })
  const triggerRef = React.useRef<HTMLButtonElement | null>(null)
  const [anchorRect, setAnchorRectState] = React.useState<DOMRect | null>(null)
  const labels = React.useRef(new Map<string, string>())

  const setAnchorRect = React.useCallback((rect: DOMRect | null) => {
    setAnchorRectState(rect)
  }, [])

  return (
    <SelectContext.Provider
      value={{
        value: selected,
        setValue: setSelected,
        open: isOpen,
        setOpen: setIsOpen,
        disabled,
        triggerRef,
        anchorRect,
        setAnchorRect,
        labels,
        children,
      }}
    >
      <div data-slot="select" {...props}>
        {children}
      </div>
    </SelectContext.Provider>
  )
}

function SelectGroup({ ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="select-group" {...props} />
}

function SelectValue({
  placeholder,
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { placeholder?: React.ReactNode }) {
  const { value, labels, children } = useSelectContext()
  let label = value ? labels.current.get(value) : undefined

  if (value && !label && children) {
    const extractText = (node: React.ReactNode): string => {
      if (typeof node === "string" || typeof node === "number") return String(node)
      if (Array.isArray(node)) return node.map(extractText).join(" ")
      if (React.isValidElement(node)) return extractText((node.props as any).children)
      return ""
    }

    const findLabel = (nodes: React.ReactNode): string | undefined => {
      let found: string | undefined
      React.Children.forEach(nodes, (child) => {
        if (found) return
        if (!React.isValidElement(child)) return
        const childProps = child.props as any
        if (childProps && childProps.value === value && childProps.children) {
          found = extractText(childProps.children).replace(/\s+/g, " ").trim()
        } else if (childProps && childProps.children) {
          found = findLabel(childProps.children)
        }
      })
      return found
    }

    label = findLabel(children)
    if (label) {
      labels.current.set(value, label)
    }
  }

  return (
    <span
      data-slot="select-value"
      className={cn(value ? "" : "text-muted-foreground/60", className)}
      {...props}
    >
      {label ?? placeholder ?? ""}
    </span>
  )
}

function SelectTrigger({
  className,
  children,
  render,
  asChild,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  render?: React.ReactElement
  asChild?: boolean
}) {
  const { open, setOpen, disabled, triggerRef, setAnchorRect } = useSelectContext()
  const setTriggerNode = React.useCallback(
    (node: HTMLButtonElement | null) => {
      triggerRef.current = node
    },
    [triggerRef]
  )

  const handleClick = composeEventHandlers(onClick, (event: unknown) => {
    if (disabled) return
    const target = event as React.MouseEvent<HTMLElement>
    const node = target.currentTarget as HTMLElement
    setAnchorRect(node.getBoundingClientRect())
    setOpen(!open)
  })

  const triggerProps = {
    "data-slot": "select-trigger",
    "aria-expanded": open,
    "aria-haspopup": "listbox",
    disabled,
    type: "button" as const,
    ...props,
    className: cn(
      "flex h-8 w-full items-center justify-between rounded-sm border border-primary/20 bg-background px-3 py-1 text-sm font-normal transition-all duration-300 outline-none focus:border-primary/60 focus:ring-4 focus:ring-primary/5 focus-visible:border-primary/60 focus-visible:ring-4 focus-visible:ring-primary/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-primary/35 dark:focus:border-primary/50 dark:focus-visible:border-primary/50 md:text-sm",
      className
    ),
    onClick: handleClick,
  }

  const content = (
    <>
      <span className="min-w-0 flex-1 truncate text-left">{children}</span>
      <ChevronDownIcon className="size-3.5 shrink-0 opacity-50 text-foreground/50" />
    </>
  )

  if (render) {
    // eslint-disable-next-line react-hooks/refs
    return cloneElementWithProps(render, { ...triggerProps, ref: setTriggerNode }, content)
  }

  if (asChild && React.isValidElement(children)) {
    // eslint-disable-next-line react-hooks/refs
    return cloneElementWithProps(children, { ...triggerProps, ref: setTriggerNode })
  }

  return (
    <button ref={setTriggerNode} {...(triggerProps as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
      {content}
    </button>
  )
}

function SelectPortal({ children }: { children?: React.ReactNode }) {
  if (typeof document === "undefined") return null
  return createPortal(children, document.body)
}

function SelectContent({
  className,
  children,
  sideOffset = 4,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { sideOffset?: number }) {
  const { open, setOpen, anchorRect, triggerRef } = useSelectContext()
  const [placement, setPlacement] = React.useState<"top" | "bottom">("bottom")
  const [availableHeight, setAvailableHeight] = React.useState<number>(0)
  const [horizontalPlacement, setHorizontalPlacement] = React.useState<"start" | "end">("start")

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
    const nextHorizontalPlacement =
      spaceRight >= rect.width || spaceRight >= spaceLeft ? "start" : "end"

    const nextPlacement = spaceBelow >= spaceAbove ? "bottom" : "top"
    const nextAvailableHeight = Math.max(0, nextPlacement === "bottom" ? spaceBelow : spaceAbove)

    setPlacement(nextPlacement)
    setAvailableHeight(nextAvailableHeight)
    setHorizontalPlacement(nextHorizontalPlacement)
  }, [anchorRect, sideOffset, triggerRef])

  React.useEffect(() => {
    if (!open) return
    updatePlacement()

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      const element = document.querySelector('[data-slot="select-content"]')
      if (element && element.contains(target)) return
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

  const contentHeight = availableHeight > 0 ? Math.min(availableHeight, 320) : 320

  return (
    <SelectPortal>
      <div className="fixed inset-0 z-50">
        <div
          data-slot="select-content"
          role="listbox"
          className={cn(
            "absolute z-50 min-w-[8rem] overflow-y-auto rounded-sm border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground shadow-md",
            className
          )}
          style={{
            top: placement === "bottom" ? anchorRect.bottom + sideOffset : undefined,
            bottom: placement === "top" ? window.innerHeight - anchorRect.top + sideOffset : undefined,
            left: horizontalPlacement === "start" ? Math.max(8, anchorRect.left) : undefined,
            right:
              horizontalPlacement === "end"
                ? Math.max(8, window.innerWidth - anchorRect.right)
                : undefined,
            minWidth: anchorRect.width,
            maxWidth: "calc(100vw - 16px)",
            maxHeight: contentHeight,
          }}
          {...props}
        >
          {children}
        </div>
      </div>
    </SelectPortal>
  )
}

function SelectItem({
  className,
  children,
  value,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const { value: selectedValue, setValue, setOpen, labels } = useSelectContext()
  const labelText = React.useMemo(() => {
    const extractText = (node: React.ReactNode): string => {
      if (typeof node === "string" || typeof node === "number") return String(node)
      if (Array.isArray(node)) return node.map(extractText).join(" ")
      if (React.isValidElement(node)) return extractText((node.props as { children?: React.ReactNode }).children)
      return ""
    }

    return extractText(children).replace(/\s+/g, " ").trim()
  }, [children])
  const isSelected = selectedValue === value

  React.useEffect(() => {
    if (labelText) {
      labels.current.set(value, labelText)
    }
  }, [labelText, labels, value])

  return (
    <button
      type="button"
      data-slot="select-item"
      role="option"
      aria-selected={isSelected}
      disabled={disabled}
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-sm py-1 pl-7 pr-2 text-sm md:text-xs outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus:bg-sidebar-accent focus:text-sidebar-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
      onClick={(event) => {
        props.onClick?.(event)
        if (disabled) return
        setValue(value)
        setOpen(false)
      }}
    >
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <CheckIcon className={cn("size-3.5", isSelected ? "opacity-100" : "opacity-0")} />
      </span>
      <span className="truncate">{children}</span>
    </button>
  )
}

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectPortal,
}
