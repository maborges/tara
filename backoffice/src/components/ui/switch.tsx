"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const switchVariants = cva(
  "peer inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input/60 dark:data-[state=unchecked]:bg-muted",
  {
    variants: {
      size: {
        default: "h-6 w-11 px-0.5",
        sm: "h-5 w-9 px-0.5",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  }
)

const switchThumbVariants = cva(
  "pointer-events-none block rounded-full bg-white shadow-sm ring-0 transition-transform dark:bg-foreground",
  {
    variants: {
      size: {
        default: "h-5 w-5 data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
        sm: "h-4 w-4 data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  }
)

interface SwitchProps
  extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>,
  VariantProps<typeof switchVariants> {
  onCheckedChange?: (checked: boolean) => void
}

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  SwitchProps
>(({ className, size, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(switchVariants({ size }), className)}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(switchThumbVariants({ size }))}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch, switchVariants }
