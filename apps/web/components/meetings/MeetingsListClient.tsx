'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Plus, Clock, Eye, CheckCircle2, XCircle, BarChart3 } from 'lucide-react';
import { MemberAvatar } from '@/components/shared/MemberAvatar';

interface PartnerLite {
  id: string;
  name: string;
  slug: string;
  color_hex: string;
  avatar_url: string | null;
}

interface RequestRow {
  id: string;
  title: string;
  target_partner_id: string;
  proposed_start: string;
  proposed_end: string;
  status: 'pending' | 'in_review' | 'approved' | 'rejected' | 'cancelled' | 'completed' | 'expired';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  created_at: string;
  reviewed_at: string | null;
  decision_reason: string | null;
}

interface Props {
  member: { id: string; name: string };
  requests: RequestRow[];
  partners: PartnerLite[];
}

const STATUS_META: Record<
  RequestRow['status'],
  { label: string; color: string; bg: string; border: string }
> = {
  pending:    { label: 'Pendente',  color: 'text-amber-400',  bg: 'bg-amber-400/10', border: 'border-amber-400/30' },
  in_review:  { label: 'Em análise', color: 'text-blue-400',  bg: 'bg-blue-400/10',  border: 'border-blue-400/30' },
  approved:   { label: 'Aprovada',  color: 'text-success',    bg: 'bg-success/10',   border: 'border-success/30' },
  rejected:   { label: 'Rejeitada', color: 'text-danger',     bg: 'bg-danger/10',    border: 'border-danger/30' },
  cancelled:  { label: 'Cancelada', color: 'text-text-muted', bg: 'bg-surface-overlay', border: 'border-surface-border' },
  completed:  { label: 'Concluída', color: 'text-success',    bg: 'bg-success/5',    border: 'border-success/20' },
  expired:    { label: 'Expirada',  color: 'text-text-muted', bg: 'bg-surface-overlay', border: 'border-surface-border' },
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `há ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

export function MeetingsListClient({ requests, partners }: Props) {
  const partnerById = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners]);

  const stats = useMemo(() => ({
    pending: requests.filter((r) => r.status === 'pending').length,
    review: requests.filter((r) => r.status === 'in_review').length,
    approved: requests.filter((r) => r.status === 'approved').length,
    total: requests.length,
  }), [requests]);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-text-primary text-xl font-semibold">Reuniões</h1>
            <p className="text-text-muted text-sm mt-1">
              Solicite uma conversa com um sócio. Acompanhe o status.
            </p>
          </div>
          <Link
            href="/meetings/new"
            className="text-xs font-medium px-4 py-2.5 rounded-md bg-accent text-brand hover:bg-accent-bright transition-colors flex items-center gap-2 min-h-[40px]"
            style={{ color: '#0D1B2A' }}
          >
            <Plus className="w-4 h-4" />
            Nova solicitação
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard icon={<Clock className="w-4 h-4" />}        value={stats.pending}  label="Pendentes"   tone="amber" />
          <StatCard icon={<Eye className="w-4 h-4" />}          value={stats.review}   label="Em análise"  tone="blue" />
          <StatCard icon={<CheckCircle2 className="w-4 h-4" />} value={stats.approved} label="Aprovadas"   tone="success" />
          <StatCard icon={<BarChart3 className="w-4 h-4" />}    value={stats.total}    label="Total"       tone="gold" />
        </div>

        {/* List */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-border flex items-center">
            <span className="text-text-secondary text-xs uppercase tracking-wider font-medium">
              Minhas solicitações
            </span>
            <span className="text-text-muted text-xs ml-auto">{requests.length} no total</span>
          </div>

          {requests.length === 0 ? (
            <div className="px-5 py-12 text-center text-text-muted text-sm">
              Nenhuma solicitação ainda.
              <br />
              <Link href="/meetings/new" className="text-accent hover:underline">
                Criar a primeira →
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-surface-border">
              {requests.map((r, idx) => {
                const partner = partnerById.get(r.target_partner_id);
                const meta = STATUS_META[r.status];
                return (
                  <motion.li
                    key={r.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                  >
                    <Link
                      href={`/meetings/${r.id}`}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-surface-overlay transition-colors"
                    >
                      {partner && (
                        <MemberAvatar
                          member={{ name: partner.name, colorHex: partner.color_hex, avatarUrl: partner.avatar_url }}
                          size="md"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-text-primary text-sm font-medium truncate">
                          {r.title}
                        </p>
                        <p className="text-text-muted text-xs mt-0.5">
                          com <span className="text-text-secondary">{partner?.name ?? '?'}</span>
                          {' · '}
                          {formatDateTime(r.proposed_start)}
                          {' · '}
                          <span>{timeAgo(r.created_at)}</span>
                          {r.status === 'rejected' && r.decision_reason && (
                            <> · <span className="text-danger">"{r.decision_reason}"</span></>
                          )}
                        </p>
                      </div>
                      <span className={`text-[10px] uppercase tracking-wider font-medium px-2.5 py-1 rounded-full border ${meta.bg} ${meta.color} ${meta.border} flex-shrink-0`}>
                        {meta.label}
                      </span>
                    </Link>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon, value, label, tone,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  tone: 'amber' | 'blue' | 'success' | 'gold';
}) {
  const toneCls = {
    amber:   'text-amber-400 bg-amber-400/10',
    blue:    'text-blue-400 bg-blue-400/10',
    success: 'text-success bg-success/10',
    gold:    'text-accent bg-accent/10',
  }[tone];

  return (
    <div className="bg-surface-elevated border border-surface-border rounded-xl p-4">
      <div className={`inline-flex w-8 h-8 rounded-md ${toneCls} items-center justify-center mb-2`}>
        {icon}
      </div>
      <p className="text-text-primary text-xl font-semibold leading-none">{value}</p>
      <p className="text-text-muted text-[11px] uppercase tracking-wider mt-1.5 font-medium">
        {label}
      </p>
    </div>
  );
}
