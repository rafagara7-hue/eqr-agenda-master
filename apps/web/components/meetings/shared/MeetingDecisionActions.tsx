'use client';

import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DecisionAction = 'approve' | 'reject' | 'cancel';

export interface MeetingDecisionActionsProps {
  busyAction: DecisionAction | null;
  /** disabled fora do próprio botão (ex.: bloquear todos durante mutacao paralela) */
  disabled?: boolean;
  approveLabel?: string;
  rejectLabel?: string;
  onApprove: () => void;
  onReject: () => void;
  /** layout: row (botoes lado a lado) ou stack (vertical mobile) */
  layout?: 'row' | 'stack';
  className?: string;
}

/**
 * Par "Recusar / Aprovar" padronizado. Spinner em ambos quando em mutacao.
 * Usado em Partner, Admin (e potencialmente detail page).
 */
export function MeetingDecisionActions({
  busyAction, disabled = false,
  approveLabel = 'Aprovar', rejectLabel = 'Recusar',
  onApprove, onReject,
  layout = 'row', className,
}: MeetingDecisionActionsProps) {
  return (
    <div className={cn(
      'flex gap-2',
      layout === 'stack' ? 'flex-col' : 'flex-row',
      className,
    )}>
      <button
        type="button"
        disabled={disabled}
        onClick={onReject}
        className="text-xs font-medium px-3 py-1.5 rounded-md border border-danger/40 text-danger hover:bg-danger/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px] flex items-center gap-1.5"
      >
        {busyAction === 'reject' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <XCircle className="w-3.5 h-3.5" />
        )}
        {rejectLabel}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onApprove}
        className={cn(
          'text-xs font-medium px-3 py-1.5 rounded-md bg-success/15 text-success border border-success/40 hover:bg-success/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px] flex items-center gap-1.5',
          layout === 'row' && 'ml-auto',
        )}
      >
        {busyAction === 'approve' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5" />
        )}
        {approveLabel}
      </button>
    </div>
  );
}
