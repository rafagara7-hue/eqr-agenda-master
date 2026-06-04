'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Clock, CheckCircle2, XCircle, Calendar as CalIcon, RefreshCw, Phone, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import {
  MeetingPriorityBadge,
  MeetingTimeBlock,
  MeetingStatCard,
  MeetingDecisionActions,
  MeetingPageHeader,
  MeetingErrorBanner,
  type DecisionAction,
} from '@/components/meetings/shared';
import {
  formatMeetingTime,
  meetingTimeAgo,
  meetingDateRelativeLabel,
} from '@/lib/meetings/format';
import type { MeetingPriority } from '@/lib/meetings/statuses';

interface MemberLite {
  id: string;
  name: string;
  slug: string;
  color_hex: string;
  avatar_url: string | null;
  role: string;
}

interface PendingRequest {
  id: string;
  title: string;
  description: string | null;
  requester_id: string;
  proposed_start: string;
  proposed_end: string;
  suggested_start: string | null;
  suggested_end: string | null;
  status: 'pending' | 'in_review';
  priority: MeetingPriority;
  created_at: string;
  decision_reason: string | null;
  metadata: Record<string, unknown> | null;
}

interface ExternalContact {
  name: string;
  phone: string;
}

function getExternalContact(r: PendingRequest): ExternalContact | null {
  const ext = (r.metadata as { external?: { name?: string; phone?: string } } | null)?.external;
  if (ext && typeof ext.name === 'string' && typeof ext.phone === 'string') {
    return { name: ext.name, phone: ext.phone };
  }
  return null;
}

interface RecentDecision {
  id: string;
  title: string;
  requester_id: string;
  proposed_start: string;
  status: 'approved' | 'rejected';
  reviewed_at: string;
}

interface UpcomingEvent {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  status: string;
}

interface Props {
  member: { id: string; name: string };
  pendingRequests: PendingRequest[];
  recentDecisions: RecentDecision[];
  upcomingEvents: UpcomingEvent[];
  members: MemberLite[];
  hasLoadError?: boolean;
}

type BusyState = { id: string; action: DecisionAction } | null;

export function PartnerMeetingsClient({
  member, pendingRequests, recentDecisions, upcomingEvents, members, hasLoadError,
}: Props) {
  const router = useRouter();
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const [busy, setBusy] = useState<BusyState>(null);
  const anyBusy = busy !== null;

  const [refreshing, setRefreshing] = useState(false);

  const upcomingThisWeek = useMemo(() => {
    const now = new Date();
    const weekFromNow = new Date(); weekFromNow.setDate(now.getDate() + 7);
    return upcomingEvents.filter((e) => new Date(e.start_at) <= weekFromNow).length;
  }, [upcomingEvents]);

  // Separa pendentes em internas (sócio→sócio) e externas (/agendar)
  const externalPending = useMemo(
    () => pendingRequests.filter((r) => getExternalContact(r) !== null),
    [pendingRequests],
  );
  const internalPending = useMemo(
    () => pendingRequests.filter((r) => getExternalContact(r) === null),
    [pendingRequests],
  );

  function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 800);
  }

  async function handleApprove(requestId: string) {
    if (anyBusy) return;
    if (!confirm('Aprovar esta solicitação? Será criado um evento no seu calendário.')) return;
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
      <div className="max-w-5xl mx-auto">
        <MeetingPageHeader
          title={`Reuniões — ${member.name}`}
          showNewMeetingCta
          trailing={
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-md border border-surface-border hover:bg-surface-overlay transition-colors disabled:opacity-50 min-h-[40px] min-w-[40px] flex items-center justify-center"
              title="Atualizar"
              aria-label="Atualizar"
            >
              <RefreshCw className={`w-4 h-4 text-text-muted ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          }
        />

        <MeetingErrorBanner visible={!!hasLoadError} />

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <MeetingStatCard icon={<Clock className="w-4 h-4" />}        value={pendingRequests.length} label="Aguardam você" tone="amber" />
          <MeetingStatCard icon={<CalIcon className="w-4 h-4" />}      value={upcomingThisWeek}       label="Próximas"      tone="gold" />
          <MeetingStatCard icon={<CheckCircle2 className="w-4 h-4" />} value={recentDecisions.filter((d) => d.status === 'approved').length} label="Aprovadas"  tone="success" />
          <MeetingStatCard icon={<XCircle className="w-4 h-4" />}      value={recentDecisions.filter((d) => d.status === 'rejected').length} label="Rejeitadas" tone="danger" />
        </div>

        {/* Funcionários (solicitações externas via /agendar) */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden mb-5">
          <div className="px-5 py-3 border-b border-surface-border flex items-center">
            <UserCheck className="w-3.5 h-3.5 text-accent mr-2" />
            <span className="text-text-secondary text-xs uppercase tracking-wider font-medium">
              Funcionários
            </span>
            <span className="text-accent font-semibold ml-2 text-xs">({externalPending.length})</span>
          </div>

          {externalPending.length === 0 ? (
            <div className="px-5 py-8 text-center text-text-muted text-sm">
              Nenhuma solicitação de funcionário no momento.
            </div>
          ) : (
            <div className="divide-y divide-surface-border">
              {externalPending.map((r, idx) => {
                const contact = getExternalContact(r)!;
                const useSuggested = !!(r.suggested_start && r.suggested_end);
                const startIso = useSuggested ? (r.suggested_start as string) : r.proposed_start;
                const endIso = useSuggested ? (r.suggested_end as string) : r.proposed_end;
                const itemBusy = busy?.id === r.id;

                return (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.04, 0.3) }}
                    className="p-5"
                  >
                    <Link href={`/meetings/${r.id}`} className="block group">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0">
                          <UserCheck className="w-4 h-4 text-accent" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-text-primary font-medium text-sm group-hover:text-accent transition-colors">
                            {r.title}
                          </p>
                          <p className="text-text-muted text-xs mt-0.5">
                            <span className="text-text-secondary">{contact.name}</span>
                            {' · '}
                            <a
                              href={`tel:${contact.phone.replace(/\D/g, '')}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-accent hover:underline inline-flex items-center gap-0.5"
                            >
                              <Phone className="w-3 h-3" />
                              {contact.phone}
                            </a>
                            {' · '}
                            {meetingTimeAgo(r.created_at)}
                          </p>
                        </div>
                        <MeetingPriorityBadge priority={r.priority} highOnly />
                      </div>

                      <MeetingTimeBlock
                        startIso={startIso}
                        endIso={endIso}
                        rescheduled={useSuggested}
                        className="mb-3"
                      />

                      {r.description && (
                        <p className="text-text-secondary text-xs mb-3 px-1">
                          "{r.description}"
                        </p>
                      )}
                    </Link>

                    <MeetingDecisionActions
                      busyAction={itemBusy ? busy?.action ?? null : null}
                      disabled={anyBusy}
                      onApprove={() => void handleApprove(r.id)}
                      onReject={() => void handleReject(r.id)}
                      approveLabel="Aprovar"
                      rejectLabel="Recusar"
                      className="mt-3"
                    />
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sócios (solicitações internas) */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden mb-5">
          <div className="px-5 py-3 border-b border-surface-border flex items-center">
            <span className="text-text-secondary text-xs uppercase tracking-wider font-medium">
              Sócios
            </span>
            <span className="text-accent font-semibold ml-2 text-xs">({internalPending.length})</span>
          </div>

          {internalPending.length === 0 ? (
            <div className="px-5 py-8 text-center text-text-muted text-sm">
              Nenhuma solicitação de sócio.
            </div>
          ) : (
            <div className="divide-y divide-surface-border">
              {internalPending.map((r, idx) => {
                const requester = memberById.get(r.requester_id);
                const useSuggested = !!(r.suggested_start && r.suggested_end);
                const startIso = useSuggested ? (r.suggested_start as string) : r.proposed_start;
                const endIso = useSuggested ? (r.suggested_end as string) : r.proposed_end;
                const itemBusy = busy?.id === r.id;

                return (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.04, 0.3) }}
                    className="p-5"
                  >
                    <Link href={`/meetings/${r.id}`} className="block group">
                      <div className="flex items-start gap-3 mb-3">
                        {requester && (
                          <MemberAvatar
                            member={{ name: requester.name, colorHex: requester.color_hex, avatarUrl: requester.avatar_url }}
                            size="md"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-text-primary font-medium text-sm group-hover:text-accent transition-colors">
                            {r.title}
                          </p>
                          <p className="text-text-muted text-xs mt-0.5">
                            Solicitada por <span className="text-text-secondary">{requester?.name ?? '?'}</span>
                            {' · '}
                            {meetingTimeAgo(r.created_at)}
                          </p>
                        </div>
                        <MeetingPriorityBadge priority={r.priority} highOnly />
                      </div>

                      <MeetingTimeBlock
                        startIso={startIso}
                        endIso={endIso}
                        rescheduled={useSuggested}
                        className="mb-3"
                      />

                      {r.description && (
                        <p className="text-text-secondary text-xs mb-3 px-1">
                          "{r.description}"
                        </p>
                      )}
                    </Link>

                    <MeetingDecisionActions
                      busyAction={itemBusy ? busy?.action ?? null : null}
                      disabled={anyBusy}
                      onApprove={() => void handleApprove(r.id)}
                      onReject={() => void handleReject(r.id)}
                      approveLabel="Aprovar"
                      rejectLabel="Recusar"
                      className="mt-3"
                    />
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Próximas reuniões confirmadas */}
        {upcomingEvents.length > 0 && (
          <div className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden mb-5">
            <div className="px-5 py-3 border-b border-surface-border flex items-center">
              <span className="text-text-secondary text-xs uppercase tracking-wider font-medium">
                Próximas reuniões
              </span>
              <span className="text-accent font-semibold ml-2 text-xs">({upcomingEvents.length})</span>
            </div>
            <ul className="divide-y divide-surface-border">
              {upcomingEvents.map((e) => (
                <li key={e.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="text-center min-w-[60px]">
                    <div className="text-accent text-lg font-bold leading-tight">
                      {formatMeetingTime(e.start_at)}
                    </div>
                    <div className="text-text-muted text-[10px] uppercase tracking-wider">
                      {meetingDateRelativeLabel(e.start_at)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-text-primary text-sm font-medium truncate">{e.title}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Histórico recente */}
        {recentDecisions.length > 0 && (
          <div className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-surface-border">
              <span className="text-text-secondary text-xs uppercase tracking-wider font-medium">
                Decisões recentes (30 dias)
              </span>
            </div>
            <ul className="divide-y divide-surface-border text-sm">
              {recentDecisions.map((d) => {
                const requester = memberById.get(d.requester_id);
                return (
                  <li key={d.id}>
                    <Link
                      href={`/meetings/${d.id}`}
                      className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-overlay transition-colors"
                    >
                      {d.status === 'approved' ? (
                        <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-danger flex-shrink-0" />
                      )}
                      <span className="text-text-primary text-xs flex-1 truncate">
                        {d.title}
                        <span className="text-text-muted"> · {requester?.name ?? '?'}</span>
                      </span>
                      <span className="text-text-muted text-[11px]">
                        {meetingTimeAgo(d.reviewed_at)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
