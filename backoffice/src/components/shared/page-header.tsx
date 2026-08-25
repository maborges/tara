import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { HeaderBackButton } from "./header-back-button";

// ─── Breadcrumb ──────────────────────────────────────────────
interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  /** Slot para botões de ação (ex: "+ Novo") */
  actions?: React.ReactNode;
  /** Ícone opcional para o título */
  icon?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  icon,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-2 md:flex-row md:items-start md:justify-between", className)}>
      <div className="flex min-w-fit flex-1 flex-col gap-1">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Navegação" className="flex items-center gap-1 text-xs text-muted-foreground">
            {breadcrumbs.map((crumb, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span aria-hidden="true" className="select-none">/</span>}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="hover:text-foreground transition-colors truncate max-w-[160px]"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-foreground font-medium truncate max-w-[160px]" aria-current="page">
                    {crumb.label}
                  </span>
                )}
              </React.Fragment>
            ))}
            <HeaderBackButton />
          </nav>
        )}
        <h1 className="flex items-center gap-3 text-balance text-3xl font-light leading-tight text-foreground">
          {icon && (
            <span className="inline-flex shrink-0 text-primary bg-primary/10 p-2 rounded-sm border border-primary/20 shadow-sm ring-1 ring-primary/10">
              {icon}
            </span>
          )}
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground text-pretty">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 mt-2 md:mt-0">
          {actions}
        </div>
      )}
    </div>
  );
}
