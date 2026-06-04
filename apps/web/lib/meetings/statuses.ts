/**
 * Meta central de status/priority de meeting_requests.
 * Fonte unica da verdade para labels, cores, agrupamentos.
 * Mudar visual aqui propaga pra todos os componentes.
 */

export type MeetingStatus =
  | 'pending' | 'in_review' | 'approved' | 'rejected'
  | 'cancelled' | 'completed' | 'expired';

export type MeetingPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface StatusMeta {
  label: string;
  color: string;     // text token
  bg: string;        // bg token
  border: string;    // border token
}

export interface PriorityMeta {
  label: string;
  color: string;
  bg: string;
  border: string;
  emphasis: 'high' | 'normal';
}

export const STATUS_META: Record<MeetingStatus, StatusMeta> = {
  pending:   { label: 'Pendente',  color: 'text-warning',    bg: 'bg-warning/10',      border: 'border-warning/30' },
  in_review: { label: 'Em análise', color: 'text-info',      bg: 'bg-info/10',         border: 'border-info/30' },
  approved:  { label: 'Aprovada',  color: 'text-success',    bg: 'bg-success/10',      border: 'border-success/30' },
  rejected:  { label: 'Rejeitada', color: 'text-danger',     bg: 'bg-danger/10',       border: 'border-danger/30' },
  cancelled: { label: 'Cancelada', color: 'text-text-muted', bg: 'bg-surface-overlay', border: 'border-surface-border' },
  completed: { label: 'Concluída', color: 'text-success',    bg: 'bg-success/5',       border: 'border-success/20' },
  expired:   { label: 'Expirada',  color: 'text-text-muted', bg: 'bg-surface-overlay', border: 'border-surface-border' },
};

export const PRIORITY_META: Record<MeetingPriority, PriorityMeta> = {
  low:    { label: 'Baixa',   color: 'text-text-muted', bg: 'bg-surface-overlay',  border: 'border-surface-border', emphasis: 'normal' },
  normal: { label: 'Normal',  color: 'text-text-secondary', bg: 'bg-surface-overlay', border: 'border-surface-border', emphasis: 'normal' },
  high:   { label: 'Alta',    color: 'text-danger', bg: 'bg-danger/15', border: 'border-danger/30', emphasis: 'high' },
  urgent: { label: 'Urgente', color: 'text-danger', bg: 'bg-danger/15', border: 'border-danger/30', emphasis: 'high' },
};

export const ACTIVE_STATUSES: readonly MeetingStatus[] = ['pending', 'in_review'] as const;
export const DECIDED_STATUSES: readonly MeetingStatus[] = ['approved', 'rejected'] as const;
export const TERMINAL_STATUSES: readonly MeetingStatus[] = ['approved', 'rejected', 'cancelled', 'completed', 'expired'] as const;

export function isActiveStatus(s: MeetingStatus): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(s);
}

export function isHighPriority(p: MeetingPriority): boolean {
  return PRIORITY_META[p].emphasis === 'high';
}
