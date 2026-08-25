"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Progress({
    className,
    indicatorClassName,
    value = 0,
    ...props
}: React.HTMLAttributes<HTMLDivElement> & { value?: number; indicatorClassName?: string }) {
    return (
        <div
            data-slot="progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.max(0, value))}
            className={cn(
                "relative !h-2 w-full overflow-hidden rounded-full bg-muted",
                className
            )}
            {...props}
        >
            <div
                className={cn("h-full bg-primary transition-all duration-300 ease-in-out", indicatorClassName)}
                style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
            />
        </div>
    )
}

export { Progress }
