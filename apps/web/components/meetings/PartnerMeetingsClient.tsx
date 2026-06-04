'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Clock, CheckCircle2, XCircle, Calendar as CalIcon, Loader2, Plus, AlertTriangle } from 'lucide-react';
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
  priority: 'low' | 'normal' | 'high' | 'urgent';
  created_at: string;
  decision_reason: string | null;
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

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    weekday: 'short', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', timeZone: TZ,
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
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

function dateRelative(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0,0,0,0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const target = new Date(d);
  target.setHours(0,0,0,0);
  if (target.getTime() === today.getTime()) return 'HOJE';
  if (target.getTime() === tomorrow.getTime()) return 'AMANHÃ';
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: TZ }).toUpperCase();
}

type BusyState = { id: string; action: 'approve' | 'reject' } | null;

export function PartnerMeetingsClient({
  member, pendingRequests, recentDecisions, upcomingEvents, members, hasLoadError,
}: Props) {
  const router = useRouter();
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const [busy, setBusy] = useState<BusyState>(null);
  const anyBusy = busy !== null;

  const upcomingThisWeek = useMemo(() => {
    const now = new Date();
    const weekFromNow = new Date(); weekFromNow.setDate(now.getDate() + 7);
    return upcomingEvents.filter((e) => new Date(e.start_at) <= weekFromNow).length;
  }, [upcomingEvents]);

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
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-text-primary text-xl font-semibold">Reuniões — {member.name}</h1>
            <p className="text-text-muted text-sm mt-1">
              Pedidos aguardando sua decisão. Próximas reuniões confirmadas.
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard icon={<Clock className="w-4 h-4" />}        value={pendingRequests.length} label="Aguardam você"     tone="amber" />
          <StatCard icon={<CalIcon className="w-4 h-4" />}       value={upcomingThisWeek}       label="Próx. 7 dias"     tone="gold" />
          <StatCard icon={<CheckCircle2 className="w-4 h-4" />} value={recentDecisions.filter((d) => d.status === 'approved').length} label="Aprovadas (30d)" tone="success" />
          <StatCard icon={<XCircle className="w-4 h-4" />}      value={recentDecisions.filter((d) => d.status === 'rejected').length} label="Rejeitadas (30d)" tone="danger" />
        </div>

        {/* Aguardando decisão */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden mb-5">
          <div className="px-5 py-3 border-b border-surface-border flex items-center">
            <span className="text-text-secondary text-xs uppercase tracking-wider font-medium">
              Aguardando sua decisão
            </span>
            <span className="text-accent font-semibold ml-2 text-xs">({pendingRequests.length})</span>
          </div>

          {pendingRequests.length === 0 ? (
            <div className="px-5 py-10 text-center text-text-muted text-sm">
              ✓ Nenhum pedido pendente. Você está em dia.
            </div>
          ) : (
            <div className="divide-y divide-surface-border">
              {pendingRequests.map((r, idx) => {
                const requester = memberById.get(r.requester_id);
                const isHighPrio = r.priority === 'urgent' || r.priority === 'high';
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
                    <div className="flex items-start gap-3 mb-3">
                      {requester && (
                        <MemberAvatar
                          member={{ name: requester.name, colorHex: requester.color_hex, avatarUrl: requester.avatar_url }}
                          size="md"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-text-primary font-medium text-sm">
                          {r.title}
                        </p>
                        <p className="text-text-muted text-xs mt-0.5">
                          Solicitada por <span className="text-text-secondary">{requester?.name ?? '?'}</span>
                          {' · '}
                          {timeAgo(r.created_at)}
                        </p>
                      </div>
                      {isHighPrio && (
                        <span className="text-[10px] uppercase tracking-wider font-medium px-2 py-0.5 rounded-full bg-danger/15 text-danger border border-danger/30">
                          {r.priority === 'urgent' ? 'Urgente' : 'Alta'}
                        </span>
                      )}
                    </div>

                    <div className="bg-surface-overlay rounded-lg p-3 mb-3 text-xs flex items-center gap-2">
                      <CalIcon className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                      <div>
                        <span className="text-text-primary font-medium">
                          {formatDateTime(startIso)}
                        </span>
                        <span className="text-text-muted">
                          {' — '}
                          {formatTime(endIso)}
                        </span>
                        {useSuggested && (
                          <span className="text-info ml-2 text-[10px]">(reagendamento sugerido)</span>
                        )}
                      </div>
                    </div>

                    {r.description && (
                      <p className="text-text-secondary text-xs mb-3 px-1">
                        "{r.description}"
                      </p>
                    )}

                    <div className="flex gap-2 mt-3">
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
                        Recusar
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
                      {formatTime(e.start_at)}
                    </div>
                    <div className="text-text-muted text-[10px] uppercase tracking-wider">
                      {dateRelative(e.start_at)}
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
                  <li key={d.id} className="flex items-center gap-3 px-5 py-2.5">
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
                      {timeAgo(d.reviewed_at)}
                    </span>
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

function StatCard({
  icon, value, label, tone,
}: {
  icon: React.ReactNode; value: number; label: string;
  tone: 'amber' | 'gold' | 'success' | 'danger';
}) {
  const toneCls = {
    amber:   'text-amber-400 bg-amber-400/10',
    gold:    'text-accent bg-accent/10',
    success: 'text-success bg-success/10',
    danger:  'text-danger bg-danger/10',
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
