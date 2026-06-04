import type React from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MeetingPageHeaderProps {
  title: string;
  subtitle?: string;
  /** Mostra CTA "Nova solicitação" linkando pra /meetings/new */
  showNewMeetingCta?: boolean;
  /** Conteudo extra ao lado do titulo (ex.: badge personalizado) */
  trailing?: React.ReactNode;
  className?: string;
}

/**
 * Header padrao das paginas de reunioes (Funcionario, Socio, Admin, Detail).
 * Centraliza: tipografia do h1, subtitle, CTA Nova solicitacao.
 */
export function MeetingPageHeader({
  title, subtitle, showNewMeetingCta = false, trailing, className,
}: MeetingPageHeaderProps) {
  return (
    <div className={cn('mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4', className)}>
      <div className="min-w-0">
        <h1 className="text-text-primary text-xl font-semibold break-words sm:truncate">{title}</h1>
        {subtitle && <p className="text-text-muted text-sm mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        {trailing}
        {showNewMeetingCta && (
          <Link
            href="/meetings/new"
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md bg-accent text-brand hover:bg-accent-bright transition-colors min-h-[40px]"
            style={{ color: '#0D1B2A' }}
          >
            <Plus className="w-4 h-4" />
            Nova solicitação
          </Link>
        )}
      </div>
    </div>
  );
}
