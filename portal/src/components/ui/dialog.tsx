"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Dialog({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="presentation" onMouseDown={onClose}><section className="relative w-full max-w-lg rounded-sm bg-background p-5 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onMouseDown={(event) => event.stopPropagation()}><button type="button" aria-label="Fechar" className="absolute right-4 top-4 rounded-sm p-1 text-muted-foreground hover:bg-muted" onClick={onClose}><X className="size-4" /></button><h2 id="dialog-title" className="mb-1 pr-8 text-base font-medium">{title}</h2>{children}</section></div>;
}
