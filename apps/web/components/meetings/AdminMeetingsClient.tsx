'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Clock, AlertTriangle, CheckCircle2, XCircle, Calendar, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { MemberAvatar } from '@/components/shared/MemberAvatar';

const TZ = 'America/Sao_Paulo';

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
  status: 'pending' | 'in_review' | 'approved' | 'rejected' | 'cancelled' | 'completed' | 'expired';
  priority: 'low' | 'normal' | 'high' | 'urgent';
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

const STATUS_META: Record<Request['status'], { label: string; color: string; bg: string; border: string }> = {
  pending:   { label: 'Pendente',  color: 'text-warning',    bg: 'bg-warning/10',     border: 'border-warning/30' },
  in_review: { label: 'Em análise', color: 'text-info',      bg: 'bg-info/10',        border: 'border-info/30' },
  approved:  { label: 'Aprovada',  color: 'text-success',    bg: 'bg-success/10',     border: 'border-success/30' },
  rejected:  { label: 'Rejeitada', color: 'text-danger',     bg: 'bg-danger/10',      border: 'border-danger/30' },
  cancelled: { label: 'Cancelada', color: 'text-text-muted', bg: 'bg-surface-overlay', border: 'border-surface-border' },
  completed: { label: 'Concluída', color: 'text-success',    bg: 'bg-success/5',      border: 'border-success/20' },
  expired:   { label: 'Expirada',  color: 'text-text-muted', bg: 'bg-surface-overlay', border: 'border-surface-border' },
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    weekday: 'short', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', timeZone: TZ,
  });
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `há ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

function isFilter(v: string): v is Filter {
  return (FILTERS as readonly string[]).includes(v);
}

type BusyState = { id: string; action: 'approve' | 'reject' } | null;

export function AdminMeetingsClient({ member, requests, members, hasLoadError }: Props) {
  const router = useRouter();
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const [busy, setBusy] = useState<BusyState>(null);
  const anyBusy = busy !== null;
  const [filter, setFilter] = useState<Filter>('pending');
  const [partnerFilter, setPartnerFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (partnerFilter !== 'all' && r.target_partner_id !== partnerFilter) return false;
      return true;
    });
  }, [requests, filter, partnerFilter]);

  const stats = useMemo(() => ({
    pending: requests.filter((r) => r.status === 'pending').length,
    review: requests.filter((r) => r.status === 'in_review').length,
    urgent: requests.filter((r) => (r.status === 'pending' || r.status === 'in_review') && (r.priority === 'urgent' || r.priority === 'high')).length,
    approved: requests.filter((r) => r.status === 'approved').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
    total: requests.length,
  }), [requests]);

  const partners = useMemo(() => members.filter((m) => m.role === 'member' || m.role === 'admin'), [members]);

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
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-text-primary text-xl font-semibold">Reuniões — Admin</h1>
            <p className="text-text-muted text-sm mt-1">
              Painel de {member.name}. Aprove ou rejeite pedidos.
            </p>
          </div>
          <Link
            href="/meetings/new"
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md bg-accent text-brand hover:bg-accent-bright transition-colors min-h-[40px] shrink-0"
            style={{ color: '#0D1B2A' }}
          >
            <Plus className="w-4 h-4" />
            Nova solicitação
          </Link>
        </div>

        {hasLoadError && (
          <div className="mb-4 px-4 py-3 rounded-lg border border-warning/40 bg-warning/10 text-warning text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Alguns dados podem estar incompletos. Recarregue a página em instantes.</span>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <StatCard icon={<Clock className="w-4 h-4" />}          value={stats.pending}  label="Pendentes"   tone="amber" />
          <StatCard icon={<AlertTriangle className="w-4 h-4" />}  value={stats.urgent}   label="Urgentes"    tone="danger" />
          <StatCard icon={<CheckCircle2 className="w-4 h-4" />}   value={stats.approved} label="Aprovadas 30d" tone="success" />
          <StatCard icon={<XCircle className="w-4 h-4" />}        value={stats.rejected} label="Rejeitadas 30d" tone="dim" />
          <StatCard icon={<Calendar className="w-4 h-4" />}       value={stats.total}    label="Ativos + 30d" tone="gold" />
        </div>

        {/* Filtros */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl p-3 mb-4 flex flex-wrap gap-2 items-center">
          <select
            value={filter}
            onChange={(e) => { const v = e.target.value; if (isFilter(v)) setFilter(v); }}
            className="bg-surface-base border border-surface-border rounded-md px-3 py-2 text-text-secondary text-xs focus:outline-none focus:border-accent"
          >
            {FILTERS.map((f) => <option key={f} value={f}>Status: {FILTER_LABEL[f]}</option>)}
          </select>
          <select
            value={partnerFilter}
            onChange={(e) => setPartnerFilter(e.target.value)}
            className="bg-surface-base border border-surface-border rounded-md px-3 py-2 text-text-secondary text-xs focus:outline-none focus:border-accent"
          >
            <option value="all">Sócio: Todos</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {(filter !== 'pending' || partnerFilter !== 'all') && (
            <button
              type="button"
              onClick={() => { setFilter('pending'); setPartnerFilter('all'); }}
              className="text-xs text-text-muted hover:text-text-secondary px-2 py-1 underline-offset-2 hover:underline"
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
                const meta = STATUS_META[r.status];
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
                    <div className="flex items-start gap-3 mb-2">
                      {requester && (
                        <MemberAvatar
                          member={{ name: requester.name, colorHex: requester.color_hex, avatarUrl: requester.avatar_url }}
                          size="sm"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-text-primary font-medium text-sm">{r.title}</p>
                        <p className="text-text-muted text-xs mt-0.5">
                          <span className="text-text-secondary">{requester?.name ?? '?'}</span>
                          {' → '}
                          <span className="text-text-secondary">{partner?.name ?? '?'}</span>
                          {' · '}
                          {formatDateTime(startIso)}
                          {useSuggested && <span className="text-info ml-1">(reagendado)</span>}
                          {' · '}
                          {timeAgo(r.created_at)}
                        </p>
                        {r.decision_reason && (
                          <p className="text-danger text-xs mt-1">"{r.decision_reason}"</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {(r.priority === 'urgent' || r.priority === 'high') && (
                          <span className="text-[10px] uppercase tracking-wider font-medium px-2 py-0.5 rounded-full bg-danger/15 text-danger border border-danger/30">
                            {r.priority === 'urgent' ? 'Urgente' : 'Alta'}
                          </span>
                        )}
                        <span className={`text-[10px] uppercase tracking-wider font-medium px-2.5 py-1 rounded-full border ${meta.bg} ${meta.color} ${meta.border}`}>
                          {meta.label}
                        </span>
                      </div>
                    </div>

                    {isActionable && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-surface-border">
                        <button
                          type="button"
                          disabled={anyBusy}
                          onClick={() => void handleReject(r.id)}
                          className="text-xs font-medium px-3 py-1.5 rounded-md border border-danger/40 text-danger hover:bg-danger/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px] flex items-center gap-1.5"
                        >
                          {itemBusy && busy?.action === 'reject' ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5" />
                          )}
                          Rejeitar
                        </button>
                        <button
                          type="button"
                          disabled={anyBusy}
                          onClick={() => void handleApprove(r.id)}
                          className="ml-auto text-xs font-medium px-3 py-1.5 rounded-md bg-success/15 text-success border border-success/40 hover:bg-success/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px] flex items-center gap-1.5"
                        >
                          {itemBusy && busy?.action === 'approve' ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          Aprovar
                        </button>
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

function StatCard({
  icon, value, label, tone,
}: {
  icon: React.ReactNode; value: number; label: string;
  tone: 'amber' | 'danger' | 'success' | 'gold' | 'dim';
}) {
  const toneCls = {
    amber:   'text-warning bg-warning/10',
    danger:  'text-danger bg-danger/10',
    success: 'text-success bg-success/10',
    gold:    'text-accent bg-accent/10',
    dim:     'text-text-muted bg-surface-overlay',
  }[tone];

  return (
    <div className="bg-surface-elevated border border-surface-border rounded-xl p-4">
      <div className={`inline-flex w-8 h-8 rounded-md ${toneCls} items-center justify-center mb-2`}>
        {icon}
      </div>
      <p className="text-text-primary text-xl font-semibold leading-none">{value}</p>
      <p className="text-text-muted text-[11px] uppercase tracking-wider mt-1.5 font-medium">{label}</p>
    </div>
  );
}
