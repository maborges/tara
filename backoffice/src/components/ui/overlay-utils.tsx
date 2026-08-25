"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type MaybeElement = React.ReactElement | undefined | null

function composeEventHandlers<E>(
  theirHandler?: (event: E) => void,
  ourHandler?: (event: E) => void
) {
  return (event: E) => {
    theirHandler?.(event)
    ourHandler?.(event)
  }
}

function useControllableState<T>({
  prop,
  defaultProp,
  onChange,
}: {
  prop?: T
  defaultProp: T
  onChange?: (value: T) => void
}) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultProp)
  const value = prop ?? uncontrolled

  const setValue = React.useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved = typeof next === "function" ? (next as (prev: T) => T)(value) : next
      if (prop === undefined) {
        setUncontrolled(resolved)
      }
      onChange?.(resolved)
    },
    [onChange, prop, value]
  )

  return [value, setValue] as const
}

function cloneElementWithProps<P extends Record<string, unknown>>(
  element: MaybeElement,
  props: P,
  children?: React.ReactNode
) {
  if (!React.isValidElement(element)) return null

  const elementProps = element.props as Record<string, unknown>

  const merged: Record<string, unknown> = {
    ...elementProps,
    ...props,
  }

  if (elementProps.className || props.className) {
    merged.className = cn(
      elementProps.className as string | undefined,
      props.className as string | undefined
    )
  }

  if (elementProps.style || props.style) {
    merged.style = {
      ...(typeof elementProps.style === "object" && elementProps.style ? elementProps.style : {}),
      ...(typeof props.style === "object" && props.style ? props.style : {}),
    }
  }

  for (const key of Object.keys(props)) {
    if (!key.startsWith("on")) continue
    const theirs = elementProps[key]
    const ours = props[key]
    if (typeof theirs === "function" && typeof ours === "function") {
      merged[key] = composeEventHandlers(theirs as (event: unknown) => void, ours as (event: unknown) => void)
    }
  }

  if (children !== undefined) {
    merged.children = children
  }

  return React.cloneElement(element, merged)
}

export { cloneElementWithProps, composeEventHandlers, useControllableState }
