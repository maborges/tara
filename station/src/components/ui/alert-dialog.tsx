"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Button, type ButtonProps } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

function AlertDialog(props: React.ComponentProps<typeof Dialog>) {
  return <Dialog data-slot="alert-dialog" {...props} />
}

function AlertDialogTrigger(props: React.ComponentProps<typeof DialogTrigger>) {
  return <DialogTrigger data-slot="alert-dialog-trigger" {...props} />
}

function AlertDialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function AlertDialogOverlay({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="alert-dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent
      data-slot="alert-dialog-content"
      className={cn(
        "max-w-xs gap-4 rounded-sm bg-background p-4 text-sm ring-1 ring-border shadow-lg",
        className
      )}
      showCloseButton={false}
      {...props}
    >
      {children}
    </DialogContent>
  )
}

function AlertDialogHeader(props: React.ComponentProps<typeof DialogHeader>) {
  return <DialogHeader data-slot="alert-dialog-header" {...props} />
}

function AlertDialogFooter(props: React.ComponentProps<typeof DialogFooter>) {
  return <DialogFooter data-slot="alert-dialog-footer" {...props} />
}

function AlertDialogTitle(props: React.ComponentProps<typeof DialogTitle>) {
  return <DialogTitle data-slot="alert-dialog-title" {...props} />
}

function AlertDialogDescription(
  props: React.ComponentProps<typeof DialogDescription>
) {
  return <DialogDescription data-slot="alert-dialog-description" {...props} />
}

function AlertDialogAction(props: ButtonProps) {
  return (
    <Button
      data-slot="alert-dialog-action"
      variant="outline"
      size="sm"
      {...props}
    />
  )
}

function AlertDialogCancel(props: ButtonProps) {
  return <DialogClose render={<Button variant="outline" size="sm" />} {...props} />
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
}
