// components/ui/status-badge.tsx
// Badge de status reutilizável para indicadores visuais

"use client";

import { cn } from "@/lib/utils";

// ─── Ativo / Inativo ────────────────────────────────────────────────────────

type StatusVariant = "ativo" | "inativo" | "pendente" | "expirado" | "trial";

const VARIANT_STYLES: Record<StatusVariant, string> = {
    ativo: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/30",
    inativo: "bg-muted text-muted-foreground border-muted dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
    pendente: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-400/30",
    expirado: "bg-red-500/10 text-red-700 border-red-500/20 dark:bg-red-500/20 dark:text-red-300 dark:border-red-400/30",
    trial: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-400/30",
};

const VARIANT_LABELS: Record<StatusVariant, string> = {
    ativo: "Ativo",
    inativo: "Inativo",
    pendente: "Pendente",
    expirado: "Expirado",
    trial: "Trial",
};

interface StatusBadgeProps {
    status: StatusVariant;
    label?: string;
    className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium",
                VARIANT_STYLES[status],
                className
            )}
        >
            {label ?? VARIANT_LABELS[status]}
        </span>
    );
}

// ─── Workflow Status ─────────────────────────────────────────────────────────
// Mapa centralizado para todos os status de workflow da aplicação.
// Adicione novos status aqui — nunca crie statusColor local nas páginas.

type WorkflowStyle = { label: string; className: string };

const WORKFLOW_STATUS_MAP: Record<string, WorkflowStyle> = {
    // ── Positivos / Concluídos ──────────────────────────────────────────────
    ATIVO: { label: "Ativo", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/30" },
    ATIVA: { label: "Ativa", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/30" },
    APROVADO: { label: "Aprovado", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/30" },
    APROVADA: { label: "Aprovada", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/30" },
    CONCLUIDO: { label: "Concluído", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/30" },
    CONCLUIDA: { label: "Concluída", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/30" },
    FINALIZADO: { label: "Finalizado", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/30" },
    FINALIZADA: { label: "Finalizada", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/30" },
    PAGO: { label: "Pago", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/30" },
    PAGA: { label: "Paga", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/30" },
    QUITADO: { label: "Quitado", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/30" },
    ENTREGUE: { label: "Entregue", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/30" },
    LIQUIDADO: { label: "Liquidado", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/30" },
    COLHIDO: { label: "Colhido", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/30" },
    RECEBIDO: { label: "Recebido", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/30" },
    REALIZADO: { label: "Realizado", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/30" },
    REALIZADA: { label: "Realizada", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/30" },

    // ── Em andamento ───────────────────────────────────────────────────────
    EM_ANDAMENTO: { label: "Em andamento", className: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-400/30" },
    EM_EXECUCAO: { label: "Em execução", className: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-400/30" },
    PROCESSANDO: { label: "Processando", className: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-400/30" },
    ABERTO: { label: "Aberto", className: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-400/30" },
    CONFIRMADO: { label: "Confirmado", className: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-400/30" },
    ENVIADO: { label: "Enviado", className: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-400/30" },
    PLANTIO: { label: "Plantio", className: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-400/30" },
    EM_CAMPO: { label: "Em campo", className: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-400/30" },
    A_RECEBER: { label: "A receber", className: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-400/30" },

    // ── Pendentes / Aguardando ──────────────────────────────────────────────
    PENDENTE: { label: "Pendente", className: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-400/30" },
    AGUARDANDO: { label: "Aguardando", className: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-400/30" },
    AGENDADO: { label: "Agendado", className: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-400/30" },
    A_PAGAR: { label: "A pagar", className: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-400/30" },
    LIBERADO_PAGAMENTO: { label: "Liberado para pagamento", className: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-400/30" },
    EM_ORDEM_PAGAMENTO: { label: "Em ordem de pagamento", className: "bg-violet-500/10 text-violet-700 border-violet-500/20 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-400/30" },
    PARCIAL: { label: "Parcial", className: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-400/30" },
    PLANEJADO: { label: "Planejado", className: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-400/30" },
    PLANEJADA: { label: "Planejada", className: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-400/30" },
    SAFRA_PLANEJADA: { label: "Planejado", className: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-400/30" },
    PENDENTE_PAGAMENTO: { label: "Pend. Pagamento", className: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-400/30" },
    RECEBIDO_PARCIAL: { label: "Recebido parcial", className: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-400/30" },

    // ── Negativos / Cancelados ──────────────────────────────────────────────
    INATIVO: { label: "Inativo", className: "bg-muted text-muted-foreground border-muted dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700" },
    INATIVA: { label: "Inativa", className: "bg-muted text-muted-foreground border-muted dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700" },
    CANCELADO: { label: "Cancelado", className: "bg-red-500/10 text-red-700 border-red-500/20 dark:bg-red-500/20 dark:text-red-300 dark:border-red-400/30" },
    CANCELADA: { label: "Cancelada", className: "bg-red-500/10 text-red-700 border-red-500/20 dark:bg-red-500/20 dark:text-red-300 dark:border-red-400/30" },
    REPROVADO: { label: "Reprovado", className: "bg-red-500/10 text-red-700 border-red-500/20 dark:bg-red-500/20 dark:text-red-300 dark:border-red-400/30" },
    REPROVADA: { label: "Reprovada", className: "bg-red-500/10 text-red-700 border-red-500/20 dark:bg-red-500/20 dark:text-red-300 dark:border-red-400/30" },
    DEVOLVIDO: { label: "Devolvido", className: "bg-red-500/10 text-red-700 border-red-500/20 dark:bg-red-500/20 dark:text-red-300 dark:border-red-400/30" },
    ENCERRADO: { label: "Encerrado", className: "bg-red-500/10 text-red-700 border-red-500/20 dark:bg-red-500/20 dark:text-red-300 dark:border-red-400/30" },

    // ── Alertas / Vencimentos ──────────────────────────────────────────────
    VENCIDO: { label: "Vencido", className: "bg-orange-500/10 text-orange-700 border-orange-500/20 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-400/30" },
    ATRASADO: { label: "Atrasado", className: "bg-orange-500/10 text-orange-700 border-orange-500/20 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-400/30" },
    OVERDUE: { label: "Atrasado", className: "bg-orange-500/10 text-orange-700 border-orange-500/20 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-400/30" },
    VENCE_HOJE: { label: "Vence hoje", className: "bg-orange-500/10 text-orange-700 border-orange-500/20 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-400/30" },

    // ── Rascunho / Indefinido ──────────────────────────────────────────────
    RASCUNHO: { label: "Rascunho", className: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700" },
    EMITIDO: { label: "Emitido", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/30" },
    DRAFT: { label: "Rascunho", className: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700" },
    INDEFINIDO: { label: "Indefinido", className: "bg-muted text-muted-foreground border-muted dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700" },

    // ── Especiais ─────────────────────────────────────────────────────────
    TRIAL: { label: "Trial", className: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-400/30" },
    EXPIRADO: { label: "Expirado", className: "bg-red-500/10 text-red-700 border-red-500/20 dark:bg-red-500/20 dark:text-red-300 dark:border-red-400/30" },
    CONVERTIDO: { label: "Convertido", className: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-400/30" },
    PERDIDO: { label: "Perdido", className: "bg-red-500/10 text-red-700 border-red-500/20 dark:bg-red-500/20 dark:text-red-300 dark:border-red-400/30" },
    PUBLICO: { label: "Público", className: "bg-cyan-500/10 text-cyan-700 border-cyan-500/20 dark:bg-cyan-500/20 dark:text-cyan-300 dark:border-cyan-400/30" },
    PRIVADO: { label: "Privado", className: "bg-violet-500/10 text-violet-700 border-violet-500/20 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-400/30" },
    ADMIN: { label: "Admin", className: "bg-violet-500/10 text-violet-700 border-violet-500/20 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-400/30" },
    SUPORTE: { label: "Suporte", className: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-400/30" },
    FINANCEIRO: { label: "Financeiro", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/30" },
    TRANSACIONAL: { label: "Transacional", className: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-400/30" },
    MARKETING: { label: "Marketing", className: "bg-fuchsia-500/10 text-fuchsia-700 border-fuchsia-500/20 dark:bg-fuchsia-500/20 dark:text-fuchsia-300 dark:border-fuchsia-400/30" },
    SISTEMA: { label: "Sistema", className: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-400/30" },
    PERCENTUAL: { label: "Percentual", className: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-400/30" },
    VALOR_FIXO: { label: "Valor fixo", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/30" },
};

const FALLBACK: WorkflowStyle = {
    label: "",
    className: "bg-muted text-muted-foreground border-muted dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
};

/** Retorna `{ label, className }` para qualquer status string. */
export function getWorkflowStyle(status: string): WorkflowStyle {
    return WORKFLOW_STATUS_MAP[status] ?? { ...FALLBACK, label: status.replace(/_/g, " ") };
}

interface WorkflowStatusBadgeProps {
    status: string;
    /** Label customizado (sobrescreve o mapa) */
    label?: string;
    className?: string;
}

/**
 * Badge para status de workflow (PENDENTE, APROVADO, CONCLUIDO, etc.).
 * Usa o mapa centralizado em status-badge.tsx — nunca crie statusColor local.
 */
export function WorkflowStatusBadge({ status, label, className }: WorkflowStatusBadgeProps) {
    const style = getWorkflowStyle(status);
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium",
                style.className,
                className
            )}
        >
            {label ?? style.label}
        </span>
    );
}
