'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Clock, CheckCircle2, XCircle, Calendar as CalIcon, RefreshCw, Phone, UserCheck, Send, ChevronDown, ChevronUp, History, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import {
  MeetingPriorityBadge,
  MeetingTimeBlock,
  MeetingStatCard,
  MeetingDecisionActions,
  MeetingPageHeader,
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
  target_partner_id: string;
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

interface UpcomingApprovedRequest {
  id: string;
  title: string;
  description: string | null;
  requester_id: string;
  target_partner_id: string;
  proposed_start: string;
  proposed_end: string;
  suggested_start: string | null;
  suggested_end: string | null;
  decision_reason: string | null;
  metadata: Record<string, unknown> | null;
}

interface RecentDecision {
  id: string;
  title: string;
  requester_id: string;
  proposed_start: string;
  status: 'approved' | 'rejected';
  reviewed_at: string;
  decision_reason: string | null;
}

interface Props {
  member: { id: string; name: string };
  pendingRequests: PendingRequest[];
  outgoingRequests: PendingRequest[];
  upcomingApproved: UpcomingApprovedRequest[];
  recentDecisions: RecentDecision[];
  members: MemberLite[];
  hasLoadError?: boolean;
}

type BusyState = { id: string; action: DecisionAction } | null;

export function PartnerMeetingsClient({
  member, pendingRequests, outgoingRequests, upcomingApproved, recentDecisions, members,
}: Props) {
  const router = useRouter();
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const [busy, setBusy] = useState<BusyState>(null);
  const anyBusy = busy !== null;

  const [refreshing, setRefreshing] = useState(false);
  const [confirmApproveFor, setConfirmApproveFor] = useState<string | null>(null);
  const [expandedUpcoming, setExpandedUpcoming] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Auto-refresh quando o user volta pra aba/janela.
  // Resolve "criei reuniao mas a pessoa nao ve" — outro sócio cria em outra aba,
  // este socio retorna foco -> page revalida sem precisar clicar Atualizar.
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

  // Polling de fallback: PR #27 (focus/visibility) NAO cobre o cenario real
  // — usuaria fica passiva na aba focada esperando ver pedidos novos sem
  // trocar de aba. Sem este interval, ela so descobre clicando Atualizar
  // ou dando F5. 20s eh suficiente pra "tempo real percebido" sem custo.
  // Pula quando a aba esta oculta (poupa requests + bateria).
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 20_000);
    return () => clearInterval(id);
  }, [router]);

  const upcomingThisWeek = useMemo(() => {
    const weekFromNow = new Date(); weekFromNow.setDate(new Date().getDate() + 7);
    return upcomingApproved.filter((r) => {
      const start = new Date(r.suggested_start ?? r.proposed_start);
      return start <= weekFromNow;
    }).length;
  }, [upcomingApproved]);

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

  async function handleReject(requestId: string) {
    if (anyBusy) return;
    setBusy({ id: requestId, action: 'reject' });
    try {
      const res = await fetch(`/api/meetings/requests/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  const url = `${window.location.origin}/agendar`;
                  try {
                    await navigator.clipboard.writeText(url);
                    toast.success('Link copiado!');
                  } catch {
                    toast.error('Não foi possível copiar. Link: ' + url);
                  }
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <MeetingStatCard icon={<Clock className="w-4 h-4" />}        value={pendingRequests.length}   label="Aguardam você" tone="amber" />
          <MeetingStatCard icon={<Send className="w-4 h-4" />}         value={outgoingRequests.length}  label="Solicitei"     tone="gold" />
          <MeetingStatCard icon={<CalIcon className="w-4 h-4" />}      value={upcomingThisWeek}         label="Próximos 7d"   tone="success" />
          <MeetingStatCard icon={<CheckCircle2 className="w-4 h-4" />} value={upcomingApproved.length}  label="Aprovadas"     tone="success" />
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
                            {contact.name}
                          </p>
                          <p className="text-text-secondary text-xs mt-0.5 truncate">
                            {r.title}
                          </p>
                          <p className="text-text-muted text-xs mt-1">
                            <a
                              href={`tel:${contact.phone.replace(/\D/g, '')}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-accent hover:underline inline-flex items-center gap-1 px-1.5 py-1 -my-1 min-h-[32px] rounded hover:bg-accent/10 align-middle"
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
                      onApprove={() => {
                        if (confirmApproveFor === r.id) void handleApprove(r.id);
                        else setConfirmApproveFor(r.id);
                      }}
                      onReject={() => { setConfirmApproveFor(null); void handleReject(r.id); }}
                      approveLabel={confirmApproveFor === r.id ? 'Confirmar aprovação' : 'Aprovar'}
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
                      onApprove={() => {
                        if (confirmApproveFor === r.id) void handleApprove(r.id);
                        else setConfirmApproveFor(r.id);
                      }}
                      onReject={() => { setConfirmApproveFor(null); void handleReject(r.id); }}
                      approveLabel={confirmApproveFor === r.id ? 'Confirmar aprovação' : 'Aprovar'}
                      rejectLabel="Recusar"
                      className="mt-3"
                    />
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Solicitei — requests que ESTE socio enviou pra outros, ainda pendentes */}
        {outgoingRequests.length > 0 && (
          <div className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden mb-5">
            <div className="px-5 py-3 border-b border-surface-border flex items-center">
              <span className="text-text-secondary text-xs uppercase tracking-wider font-medium">
                Solicitei
              </span>
              <span className="text-accent font-semibold ml-2 text-xs">({outgoingRequests.length})</span>
              <span className="text-text-muted text-xs ml-auto">aguardando resposta do destinatário</span>
            </div>
            <ul className="divide-y divide-surface-border">
              {outgoingRequests.map((r) => {
                const target = memberById.get(r.target_partner_id);
                const useSuggested = !!(r.suggested_start && r.suggested_end);
                const startIso = useSuggested ? (r.suggested_start as string) : r.proposed_start;
                return (
                  <li key={r.id}>
                    <Link
                      href={`/meetings/${r.id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-surface-overlay transition-colors"
                    >
                      {target && (
                        <MemberAvatar
                          member={{ name: target.name, colorHex: target.color_hex, avatarUrl: target.avatar_url }}
                          size="sm"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-text-primary text-sm font-medium truncate">{r.title}</p>
                        <p className="text-text-muted text-xs mt-0.5">
                          para <span className="text-text-secondary">{target?.name ?? '?'}</span>
                          {' · '}
                          {formatMeetingTime(startIso)}
                          {useSuggested && <span className="text-info ml-1">(reagendado)</span>}
                          {' · '}
                          {meetingTimeAgo(r.created_at)}
                        </p>
                      </div>
                      <span className="text-xs text-warning font-medium uppercase tracking-wider">
                        Pendente
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Próximas reuniões — aprovadas e futuras, expansível ao clicar */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-border flex items-center">
            <CheckCircle2 className="w-3.5 h-3.5 text-success mr-2" />
            <span className="text-text-secondary text-xs uppercase tracking-wider font-medium">
              Próximas reuniões
            </span>
            <span className="text-accent font-semibold ml-2 text-xs">({upcomingApproved.length})</span>
          </div>

          {upcomingApproved.length === 0 ? (
            <div className="px-5 py-8 text-center text-text-muted text-sm">
              Nenhuma reunião aprovada no momento.
            </div>
          ) : (
            <ul className="divide-y divide-surface-border">
              {upcomingApproved.map((r) => {
                const isExpanded = expandedUpcoming === r.id;
                const startIso = r.suggested_start ?? r.proposed_start;
                const endIso = r.suggested_end ?? r.proposed_end;
                const isTarget = r.target_partner_id === member.id;
                const counterpartId = isTarget ? r.requester_id : r.target_partner_id;
                const counterpart = memberById.get(counterpartId);
                const counterpartLabel = isTarget ? 'Solicitado por' : 'Reunião com';

                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setExpandedUpcoming(isExpanded ? null : r.id)}
                      className="w-full flex items-center gap-4 px-5 py-3 hover:bg-surface-overlay transition-colors text-left"
                      aria-expanded={isExpanded}
                    >
                      <div className="text-center min-w-[60px]">
                        <div className="text-accent text-lg font-bold leading-tight">
                          {formatMeetingTime(startIso)}
                        </div>
                        <div className="text-text-muted text-[10px] uppercase tracking-wider">
                          {meetingDateRelativeLabel(startIso)}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-text-primary text-sm font-medium truncate">{r.title}</p>
                        <p className="text-text-muted text-xs truncate">
                          {counterpartLabel} <span className="text-text-secondary">{counterpart?.name ?? '?'}</span>
                        </p>
                      </div>
                      {counterpart && (
                        <div
                          className="flex-shrink-0"
                          title={`${counterpartLabel}: ${counterpart.name}`}
                          aria-label={`${counterpartLabel}: ${counterpart.name}`}
                        >
                          <MemberAvatar
                            member={{ name: counterpart.name, colorHex: counterpart.color_hex, avatarUrl: counterpart.avatar_url }}
                            size="sm"
                          />
                        </div>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-text-muted flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-text-muted flex-shrink-0" />
                      )}
                    </button>

                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="px-5 pb-4 space-y-3 border-t border-surface-border bg-surface-base/30"
                      >
                        <MeetingTimeBlock startIso={startIso} endIso={endIso} />

                        {r.description && (
                          <div className="space-y-1">
                            <div className="text-text-muted text-[10px] uppercase tracking-wider">Assunto</div>
                            <p className="text-text-primary text-sm whitespace-pre-wrap">{r.description}</p>
                          </div>
                        )}

                        {counterpart && (
                          <div className="flex items-center gap-2">
                            <MemberAvatar
                              member={{ name: counterpart.name, colorHex: counterpart.color_hex, avatarUrl: counterpart.avatar_url }}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="text-text-primary text-sm font-medium truncate">{counterpart.name}</p>
                              <p className="text-text-muted text-[11px] uppercase tracking-wider">{counterpartLabel}</p>
                            </div>
                          </div>
                        )}

                        {r.decision_reason && (
                          <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2">
                            <div className="text-success text-[10px] uppercase tracking-wider mb-0.5">Nota da aprovação</div>
                            <p className="text-text-primary text-xs whitespace-pre-wrap">{r.decision_reason}</p>
                          </div>
                        )}

                        <div className="pt-1">
                          <Link
                            href={`/meetings/${r.id}`}
                            className="text-accent text-xs font-medium hover:underline"
                          >
                            Abrir detalhes completos →
                          </Link>
                        </div>
                      </motion.div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Historico — colapsado por padrao, abre ao clicar no botao */}
        {recentDecisions.length > 0 && (
          <div className="mt-5 bg-surface-elevated border border-surface-border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="w-full px-5 py-3 flex items-center hover:bg-surface-overlay transition-colors"
              aria-expanded={showHistory}
            >
              <History className="w-3.5 h-3.5 text-text-muted mr-2" />
              <span className="text-text-secondary text-xs uppercase tracking-wider font-medium">
                Histórico
              </span>
              <span className="text-text-muted font-semibold ml-2 text-xs">
                ({recentDecisions.length})
              </span>
              <span className="text-text-muted text-[11px] ml-2 normal-case tracking-normal">
                últimos 30 dias
              </span>
              <span className="ml-auto">
                {showHistory ? (
                  <ChevronUp className="w-4 h-4 text-text-muted" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-text-muted" />
                )}
              </span>
            </button>

            {showHistory && (
              <motion.ul
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="divide-y divide-surface-border text-sm border-t border-surface-border"
              >
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
              </motion.ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

