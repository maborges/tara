"use client"

import * as React from "react"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  onChange?: React.ChangeEventHandler<HTMLInputElement>
  onCheckedChange?: (checked: boolean) => void
}

function Checkbox({
  className,
  checked,
  defaultChecked,
  onCheckedChange,
  onChange,
  ...props
}: CheckboxProps) {
  const [internalChecked, setInternalChecked] = React.useState(Boolean(defaultChecked))
  const isControlled = checked !== undefined
  const currentChecked = isControlled ? Boolean(checked) : internalChecked
  const labelTestId = (props as { "data-testid"?: string })["data-testid"]
  const inputProps = { ...props }
  delete (inputProps as { "data-testid"?: string })["data-testid"]

  return (
    <label
      data-slot="checkbox"
      data-testid={labelTestId}
      data-checked={currentChecked}
      className={cn(
        "peer relative inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary",
        currentChecked && "border-primary bg-primary text-primary-foreground",
        className
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={(event) => {
          const nextChecked = event.currentTarget.checked
          if (!isControlled) setInternalChecked(nextChecked)
          onCheckedChange?.(nextChecked)
          onChange?.(event)
        }}
        className="sr-only"
        {...inputProps}
      />
      {currentChecked && (
        <CheckIcon className="size-3.5" />
      )}
    </label>
  )
}

export { Checkbox }
