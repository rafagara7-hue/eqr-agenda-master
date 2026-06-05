import type React from 'react';
import { cn } from '@/lib/utils';

export type MeetingStatTone = 'amber' | 'gold' | 'success' | 'danger' | 'info' | 'dim';

export interface MeetingStatCardProps {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  tone: MeetingStatTone;
  className?: string;
}

const TONE_CLS: Record<MeetingStatTone, string> = {
  amber:   'text-warning bg-warning/10',
  gold:    'text-accent bg-accent/10',
  success: 'text-success bg-success/10',
  danger:  'text-danger bg-danger/10',
  info:    'text-info bg-info/10',
  dim:     'text-text-muted bg-surface-overlay',
};

/**
 * Card de estatistica usado nos dashboards (Funcionario, Socio, Admin).
 * Consolida o `StatCard` duplicado nos 3 clients.
 */
export function MeetingStatCard({ icon, value, label, tone, className }: MeetingStatCardProps) {
  return (
    <div className={cn('bg-surface-elevated border border-surface-border rounded-xl p-4', className)}>
      <div className={cn('inline-flex w-8 h-8 rounded-md items-center justify-center mb-2', TONE_CLS[tone])}>
        {icon}
      </div>
      <p className="text-text-primary text-xl font-semibold leading-none">{value}</p>
      <p className="text-text-muted text-[11px] uppercase tracking-wider mt-1.5 font-medium">{label}</p>
    </div>
  );
}
