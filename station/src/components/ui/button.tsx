"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-sm border border-transparent bg-clip-padding text-sm font-normal whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] outline-none select-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/50 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border border-primary/20 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:scale-95 shadow-sm shadow-primary/20 transition-all duration-300",
        outline:
          "border border-primary/35 bg-background text-foreground/80 hover:bg-primary/10 hover:text-primary active:scale-95 shadow-sm transition-all duration-300 dark:bg-primary/10 dark:text-foreground dark:hover:bg-primary/18 dark:hover:text-foreground dark:shadow-primary/10",
        secondary:
          "border border-primary/35 bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:text-secondary-foreground active:scale-95 transition-all duration-300 dark:bg-primary/15 dark:text-foreground dark:hover:bg-primary/25",
        ghost:
          "text-foreground/80 hover:bg-primary/10 hover:text-primary aria-expanded:bg-primary/10 active:scale-95 transition-all duration-300 dark:text-foreground dark:hover:bg-primary/15 dark:hover:text-foreground",
        destructive:
          "border border-primary/20 bg-background shadow-sm shadow-primary/20 bg-[color-mix(in_oklch,var(--destructive)_12%,var(--background))] text-destructive hover:bg-destructive hover:text-white transition-all duration-300",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 gap-1.5 px-2.5",
        xs: "h-6 gap-1 px-2 text-xs",
        sm: "h-7 gap-1 px-2.5 text-[0.8rem]",
        lg: "h-9 gap-1.5 px-2.5",
        icon: "size-8",
        "icon-xs": "size-6",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "sm",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type = "button", ...props }, ref) => {
    const Comp = asChild ? Slot : "button"

    return (
      <Comp
        ref={ref}
        data-slot="button"
        type={asChild ? undefined : type}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    )
  }
)

Button.displayName = "Button"

export { Button, buttonVariants }
