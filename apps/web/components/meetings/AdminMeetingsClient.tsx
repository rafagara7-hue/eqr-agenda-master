'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Clock, AlertTriangle, CheckCircle2, XCircle, Calendar, RefreshCw, Copy, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import {
  MeetingStatusBadge,
  MeetingPriorityBadge,
  MeetingStatCard,
  MeetingDecisionActions,
  MeetingPageHeader,
  RejectFeedbackModal,
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
  metadata: Record<string, unknown> | null;
}

interface ExternalContact { name: string; phone: string }
interface CancellationInfo { reason: string; cancelled_by_partner_id: string; cancelled_by_partner_name: string; cancelled_at: number }

function getExternalContact(r: Request): ExternalContact | null {
  const ext = (r.metadata as { external?: { name?: string; phone?: string } } | null)?.external;
  if (ext && typeof ext.name === 'string' && typeof ext.phone === 'string') return { name: ext.name, phone: ext.phone };
  return null;
}

function isPendingNotification(r: Request): boolean {
  const m = r.metadata as { notification_pending?: boolean; external?: unknown } | null;
  return r.status === 'cancelled' && !!m?.external && m?.notification_pending === true;
}

function getCancellation(r: Request): CancellationInfo | null {
  const c = (r.metadata as { cancellation?: CancellationInfo } | null)?.cancellation;
  if (c && typeof c.reason === 'string') return c;
  return null;
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
  const [confirmApproveFor, setConfirmApproveFor] = useState<string | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectRequestId, setRejectRequestId] = useState<string | null>(null);

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

  // Cancelamentos pendentes de notificacao — socio cancelou reuniao externa,
  // admin precisa avisar o solicitante externo (telefone do form).
  const pendingNotifications = useMemo(
    () => requests.filter(isPendingNotification),
    [requests],
  );

  async function handleMarkNotified(requestId: string) {
    if (anyBusy) return;
    setBusy({ id: requestId, action: 'approve' });
    try {
      const res = await fetch(`/api/meetings/requests/${requestId}/notify-external`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { toast.error(data.error ?? 'Erro'); return; }
      toast.success('Marcado como notificado');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro de rede');
    } finally {
      setBusy(null);
    }
  }

  async function handleApprove(requestId: string) {
    if (anyBusy) return;
    setConfirmApproveFor(null);
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

  async function handleReject(requestId: string, reason: string) {
    if (anyBusy) return;
    setBusy({ id: requestId, action: 'reject' });
    try {
      const res = await fetch(`/api/meetings/requests/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reason ? { reason } : {}),
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

  function openRejectModal(requestId: string) {
    setRejectRequestId(requestId);
    setRejectModalOpen(true);
  }

  async function handleRejectModalConfirm(reason: string) {
    if (rejectRequestId) {
      await handleReject(rejectRequestId, reason);
      setRejectModalOpen(false);
      setRejectRequestId(null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <MeetingPageHeader
          title="Reuniões — Admin"
          subtitle={`Painel de ${member.name}. Aprove ou rejeite pedidos.`}
          trailing={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const url = `${process.env.NEXT_PUBLIC_APP_URL}/agendar`;
                  navigator.clipboard.writeText(url);
                  toast.success('Link copiado!');
                }}
                className="p-2 rounded-md border border-surface-border hover:bg-surface-overlay transition-colors disabled:opacity-50 sm:min-h-0 sm:min-w-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                title="Copiar link do formulário"
                aria-label="Copiar link do formulário"
              >
                <Copy className="w-4 h-4 text-text-muted" />
              </button>
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
            </div>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <MeetingStatCard icon={<Clock className="w-4 h-4" />}         value={stats.pending}  label="Pendentes"      tone="amber" />
          <MeetingStatCard icon={<AlertTriangle className="w-4 h-4" />} value={stats.urgent}   label="Urgentes"       tone="danger" />
          <MeetingStatCard icon={<CheckCircle2 className="w-4 h-4" />}  value={stats.approved} label="Aprovadas"  tone="success" />
          <MeetingStatCard icon={<XCircle className="w-4 h-4" />}       value={stats.rejected} label="Rejeitadas" tone="dim" />
          <MeetingStatCard icon={<Calendar className="w-4 h-4" />}      value={stats.total}    label="Ativos"     tone="gold" />
        </div>

        {/* Cancelamentos pendentes de notificacao — socio cancelou reuniao externa, admin precisa avisar o externo */}
        {pendingNotifications.length > 0 && (
          <div className="mb-5 bg-danger/5 border border-danger/40 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-danger/30 flex items-center">
              <AlertTriangle className="w-3.5 h-3.5 text-danger mr-2" />
              <span className="text-danger text-xs uppercase tracking-wider font-medium">
                Cancelamentos a notificar
              </span>
              <span className="text-danger font-semibold ml-2 text-xs">({pendingNotifications.length})</span>
              <span className="ml-auto text-text-muted text-[11px]">Avisar o colaborador externamente</span>
            </div>
            <div className="divide-y divide-danger/20">
              {pendingNotifications.map((r) => {
                const contact = getExternalContact(r)!;
                const cancellation = getCancellation(r);
                return (
                  <div key={r.id} className="px-5 py-4">
                    <div className="flex items-start gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-text-primary font-medium text-sm">{contact.name}</p>
                        <p className="text-text-muted text-xs mt-0.5">
                          <a href={`tel:${contact.phone.replace(/\D/g, '')}`} className="text-accent hover:underline">
                            <Phone className="inline w-3 h-3" /> {contact.phone}
                          </a>
                          {' · '}<span>Reunião: {r.title}</span>
                        </p>
                        {cancellation && (
                          <>
                            <p className="text-text-muted text-xs mt-1.5">
                              Cancelado por <span className="text-text-secondary">{cancellation.cancelled_by_partner_name}</span>
                            </p>
                            {cancellation.reason && (
                              <p className="text-text-secondary text-xs mt-1 italic">"{cancellation.reason}"</p>
                            )}
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleMarkNotified(r.id)}
                        disabled={anyBusy}
                        className="text-xs font-medium px-3 py-2 rounded-lg bg-success/15 text-success border border-success/40 hover:bg-success/25 transition-colors disabled:opacity-50 min-h-[36px] inline-flex items-center gap-1.5 flex-shrink-0"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Marcar como notificado
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
                          onApprove={() => {
                            if (confirmApproveFor === r.id) void handleApprove(r.id);
                            else setConfirmApproveFor(r.id);
                          }}
                          onReject={() => { setConfirmApproveFor(null); openRejectModal(r.id); }}
                          approveLabel={confirmApproveFor === r.id ? 'Confirmar aprovação' : 'Aprovar'}
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

      <RejectFeedbackModal
        open={rejectModalOpen}
        onClose={() => {
          setRejectModalOpen(false);
          setRejectRequestId(null);
        }}
        onConfirm={handleRejectModalConfirm}
        meetingTitle={rejectRequestId ? requests.find((r) => r.id === rejectRequestId)?.title : undefined}
      />
    </div>
  );
}
