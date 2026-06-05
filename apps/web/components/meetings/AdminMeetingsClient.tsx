'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Clock, AlertTriangle, CheckCircle2, XCircle, Calendar, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import {
  MeetingStatusBadge,
  MeetingPriorityBadge,
  MeetingStatCard,
  MeetingDecisionActions,
  MeetingPageHeader,
  type DecisionAction,
} from '@/components/meetings/shared';
import {
  formatMeetingDateTime,
  meetingTimeAgo,
} from '@/lib/meetings/format';
import type { MeetingStatus, MeetingPriority } from '@/lib/meetings/statuses';

interface MemberLite {
  id: string;
  name: string;
  slug: string;
  color_hex: string;
  avatar_url: string | null;
  role: string;
}

interface Request {
  id: string;
  title: string;
  requester_id: string;
  target_partner_id: string;
  proposed_start: string;
  proposed_end: string;
  suggested_start: string | null;
  suggested_end: string | null;
  status: MeetingStatus;
  priority: MeetingPriority;
  created_at: string;
  reviewed_at: string | null;
  decision_reason: string | null;
}

interface Props {
  member: { id: string; name: string };
  requests: Request[];
  members: MemberLite[];
  hasLoadError?: boolean;
}

const FILTERS = ['all', 'pending', 'in_review', 'approved', 'rejected', 'cancelled'] as const;
type Filter = typeof FILTERS[number];

const FILTER_LABEL: Record<Filter, string> = {
  all: 'Todos',
  pending: 'Pendentes',
  in_review: 'Em análise',
  approved: 'Aprovadas',
  rejected: 'Rejeitadas',
  cancelled: 'Canceladas',
};

function isFilter(v: string): v is Filter {
  return (FILTERS as readonly string[]).includes(v);
}

type BusyState = { id: string; action: DecisionAction } | null;

export function AdminMeetingsClient({ member, requests, members }: Props) {
  const router = useRouter();
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const [busy, setBusy] = useState<BusyState>(null);
  const anyBusy = busy !== null;
  const [filter, setFilter] = useState<Filter>('all');
  const [partnerFilter, setPartnerFilter] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);

  function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 800);
  }

  // Auto-refresh quando volta foco (mesmo padrao do Partner client)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router]);

  // Polling de fallback: focus/visibility nao cobre admin parado na aba
  // assistindo a fila. 20s + skip quando hidden — mesmo padrao do partner.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 20_000);
    return () => clearInterval(id);
  }, [router]);

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (partnerFilter !== 'all' && r.target_partner_id !== partnerFilter) return false;
      return true;
    });
  }, [requests, filter, partnerFilter]);

  const stats = useMemo(() => ({
    pending: requests.filter((r) => r.status === 'pending').length,
    urgent: requests.filter((r) =>
      (r.status === 'pending' || r.status === 'in_review') &&
      (r.priority === 'urgent' || r.priority === 'high')
    ).length,
    approved: requests.filter((r) => r.status === 'approved').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
    total: requests.length,
  }), [requests]);

  const partners = useMemo(
    () => members.filter((m) => m.role === 'member' || m.role === 'admin'),
    [members],
  );

  async function handleApprove(requestId: string) {
    if (anyBusy) return;
    if (!confirm('Aprovar esta solicitação? Será criado um evento no calendário do sócio.')) return;
    setBusy({ id: requestId, action: 'approve' });
    try {
      const res = await fetch(`/api/meetings/requests/${requestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Erro ao aprovar');
        return;
      }
      toast.success('Solicitação aprovada — evento criado!');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro de rede');
    } finally {
      setBusy(null);
    }
  }

  async function handleReject(requestId: string) {
    if (anyBusy) return;
    const reason = prompt('Motivo da rejeição (visível ao solicitante):');
    if (!reason || reason.trim().length < 1) return;
    setBusy({ id: requestId, action: 'reject' });
    try {
      const res = await fetch(`/api/meetings/requests/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Erro ao rejeitar');
        return;
      }
      toast.success('Solicitação rejeitada');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro de rede');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <MeetingPageHeader
          title="Reuniões — Admin"
          subtitle={`Painel de ${member.name}. Aprove ou rejeite pedidos.`}
          showNewMeetingCta
          trailing={
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-md border border-surface-border hover:bg-surface-overlay transition-colors disabled:opacity-50 sm:min-h-0 sm:min-w-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Atualizar"
              aria-label="Atualizar"
            >
              <RefreshCw className={`w-4 h-4 text-text-muted ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <MeetingStatCard icon={<Clock className="w-4 h-4" />}         value={stats.pending}  label="Pendentes"      tone="amber" />
          <MeetingStatCard icon={<AlertTriangle className="w-4 h-4" />} value={stats.urgent}   label="Urgentes"       tone="danger" />
          <MeetingStatCard icon={<CheckCircle2 className="w-4 h-4" />}  value={stats.approved} label="Aprovadas 30d"  tone="success" />
          <MeetingStatCard icon={<XCircle className="w-4 h-4" />}       value={stats.rejected} label="Rejeitadas 30d" tone="dim" />
          <MeetingStatCard icon={<Calendar className="w-4 h-4" />}      value={stats.total}    label="Ativos + 30d"   tone="gold" />
        </div>

        {/* Filtros */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl p-3 mb-4 flex flex-wrap gap-2 items-center">
          <select
            value={filter}
            onChange={(e) => { const v = e.target.value; if (isFilter(v)) setFilter(v); }}
            className="bg-surface-base border border-surface-border rounded-md px-3 py-2 sm:py-2.5 text-text-secondary text-xs focus:outline-none focus:border-accent sm:min-h-0 min-h-[44px]"
          >
            {FILTERS.map((f) => <option key={f} value={f}>Status: {FILTER_LABEL[f]}</option>)}
          </select>
          <select
            value={partnerFilter}
            onChange={(e) => setPartnerFilter(e.target.value)}
            className="bg-surface-base border border-surface-border rounded-md px-3 py-2 sm:py-2.5 text-text-secondary text-xs focus:outline-none focus:border-accent sm:min-h-0 min-h-[44px]"
          >
            <option value="all">Sócio: Todos</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {(filter !== 'all' || partnerFilter !== 'all') && (
            <button
              type="button"
              onClick={() => { setFilter('all'); setPartnerFilter('all'); }}
              className="text-xs text-text-muted hover:text-text-secondary px-2 py-1 underline-offset-2 hover:underline sm:min-h-0 min-h-[44px]"
            >
              Limpar filtros
            </button>
          )}
          <span className="text-text-muted text-xs ml-auto">
            Mostrando <strong className="text-accent">{filtered.length}</strong> de {requests.length}
          </span>
        </div>

        {/* Lista */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="px-5 py-12 text-center text-text-muted text-sm">
              <Calendar className="w-8 h-8 mx-auto mb-2 text-text-muted/40" />
              Nenhum pedido com esses filtros.
            </div>
          ) : (
            <div className="divide-y divide-surface-border">
              {filtered.map((r, idx) => {
                const requester = memberById.get(r.requester_id);
                const partner = memberById.get(r.target_partner_id);
                const isActionable = r.status === 'pending' || r.status === 'in_review';
                const useSuggested = !!(r.suggested_start && r.suggested_end);
                const startIso = useSuggested ? (r.suggested_start as string) : r.proposed_start;
                const itemBusy = busy?.id === r.id;

                return (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                    className="p-4 sm:p-5 hover:bg-surface-overlay/40 transition-colors"
                  >
                    <Link
                      href={`/meetings/${r.id}`}
                      className="block group"
                    >
                      <div className="flex items-start gap-3 mb-2">
                        {requester && (
                          <MemberAvatar
                            member={{ name: requester.name, colorHex: requester.color_hex, avatarUrl: requester.avatar_url }}
                            size="sm"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-text-primary font-medium text-sm group-hover:text-accent transition-colors">
                            {r.title}
                          </p>
                          <p className="text-text-muted text-xs mt-0.5 break-words">
                            <span className="text-text-secondary">{requester?.name ?? '?'}</span>
                            {' → '}
                            <span className="text-text-secondary">{partner?.name ?? '?'}</span>
                            {' · '}
                            {formatMeetingDateTime(startIso)}
                            {useSuggested && <span className="text-info ml-1">(reagendado)</span>}
                            {' · '}
                            {meetingTimeAgo(r.created_at)}
                          </p>
                          {r.decision_reason && (
                            <p className="text-danger text-xs mt-1 break-words">"{r.decision_reason}"</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <MeetingPriorityBadge priority={r.priority} highOnly />
                          <MeetingStatusBadge status={r.status} />
                        </div>
                      </div>
                    </Link>

                    {isActionable && (
                      <div className="mt-3 pt-3 border-t border-surface-border">
                        <MeetingDecisionActions
                          busyAction={itemBusy ? busy?.action ?? null : null}
                          disabled={anyBusy}
                          onApprove={() => void handleApprove(r.id)}
                          onReject={() => void handleReject(r.id)}
                          approveLabel="Aprovar"
                          rejectLabel="Rejeitar"
                        />
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
