'use client';

import { useState, useMemo, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ChevronLeft, MessageCircle, History, User, Loader2, Send, Ban, Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Database } from '@eqr/database';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import {
  MeetingStatusBadge,
  MeetingPriorityBadge,
  MeetingTimeBlock,
  MeetingDecisionActions,
  MeetingPageHeader,
  type DecisionAction,
} from '@/components/meetings/shared';
import {
  formatMeetingDateLong,
  formatMeetingTime,
  meetingTimeAgo,
} from '@/lib/meetings/format';
import { isActiveStatus, type MeetingStatus, type MeetingPriority } from '@/lib/meetings/statuses';

type MemberRow = Database['public']['Tables']['members']['Row'];
type RequestRow = Database['public']['Tables']['meeting_requests']['Row'];
type EventRow = Database['public']['Tables']['meeting_request_events']['Row'];
type CommentRow = Database['public']['Tables']['meeting_request_comments']['Row'];

type MemberFields = Pick<MemberRow, 'id' | 'name' | 'slug' | 'color_hex' | 'avatar_url' | 'role'>;

interface Props {
  currentMember: MemberFields;
  request: RequestRow;
  history: EventRow[];
  comments: CommentRow[];
  members: MemberFields[];
  hasLoadError?: boolean;
}

const ACTION_LABEL: Record<EventRow['action'], string> = {
  created: 'Solicitação criada',
  submitted: 'Solicitação enviada',
  viewed: 'Visualizada',
  commented: 'Comentário adicionado',
  approved: 'Aprovada',
  rejected: 'Rejeitada',
  cancelled: 'Cancelada',
  expired: 'Expirada',
  reschedule_suggested: 'Reagendamento sugerido',
  reschedule_accepted: 'Reagendamento aceito',
  reschedule_declined: 'Reagendamento recusado',
  event_created: 'Evento criado no calendário',
  completed: 'Concluída',
};

export function MeetingDetailClient({
  currentMember, request, history, comments, members, hasLoadError,
}: Props) {
  const router = useRouter();
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const [busyAction, setBusyAction] = useState<DecisionAction | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [showSuggestForm, setShowSuggestForm] = useState(false);
  const [suggestStart, setSuggestStart] = useState('');
  const [suggestDuration, setSuggestDuration] = useState(60);
  const [suggestMessage, setSuggestMessage] = useState('');
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

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

  // Polling 20s skip-when-hidden — usuario parado no detail vendo comentarios novos
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 20_000);
    return () => clearInterval(id);
  }, [router]);

  const requester = memberById.get(request.requester_id);
  const partner = memberById.get(request.target_partner_id);

  const isRequester = currentMember.id === request.requester_id;
  const isPartner = currentMember.id === request.target_partner_id;
  const isAdmin = currentMember.role === 'admin';
  const canDecide = (isPartner || isAdmin) && isActiveStatus(request.status as MeetingStatus);
  const canCancel = isRequester && isActiveStatus(request.status as MeetingStatus);
  const canComment = isRequester || isPartner || isAdmin;
  const rejectLabel = isAdmin && !isPartner ? 'Rejeitar' : 'Recusar';

  const useSuggested = !!(request.suggested_start && request.suggested_end);
  const startIso = useSuggested ? (request.suggested_start as string) : request.proposed_start;
  const endIso = useSuggested ? (request.suggested_end as string) : request.proposed_end;

  async function handleApprove() {
    if (busyAction !== null || cancelling) return;
    setConfirmApprove(false);
    setBusyAction('approve');
    try {
      const res = await fetch(`/api/meetings/requests/${request.id}/approve`, {
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
      setBusyAction(null);
    }
  }

  async function handleReject() {
    if (busyAction !== null || cancelling) return;
    setBusyAction('reject');
    try {
      const res = await fetch(`/api/meetings/requests/${request.id}/reject`, {
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
      setBusyAction(null);
    }
  }

  async function handleSuggestReschedule(e: FormEvent) {
    e.preventDefault();
    if (suggesting) return;
    if (!suggestStart) { toast.error('Selecione um novo horário'); return; }
    const startDate = new Date(suggestStart);
    if (isNaN(startDate.getTime())) { toast.error('Horário inválido'); return; }
    const endDate = new Date(startDate);
    endDate.setMinutes(endDate.getMinutes() + suggestDuration);
    setSuggesting(true);
    try {
      const res = await fetch(`/api/meetings/requests/${request.id}/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newStart: startDate.toISOString(),
          newEnd: endDate.toISOString(),
          message: suggestMessage.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Erro ao sugerir reagendamento');
        return;
      }
      toast.success('Reagendamento sugerido!');
      setShowSuggestForm(false);
      setSuggestStart('');
      setSuggestMessage('');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro de rede');
    } finally {
      setSuggesting(false);
    }
  }

  async function handleCancel() {
    if (busyAction !== null || cancelling) return;
    setConfirmCancel(false);
    setCancelling(true);
    try {
      const res = await fetch(`/api/meetings/requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Erro ao cancelar');
        return;
      }
      toast.success('Solicitação cancelada');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro de rede');
    } finally {
      setCancelling(false);
    }
  }

  async function handlePostComment(e: FormEvent) {
    e.preventDefault();
    const body = commentBody.trim();
    if (body.length < 1 || posting) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/meetings/requests/${request.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Erro ao comentar');
        return;
      }
      setCommentBody('');
      toast.success('Comentário enviado');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro de rede');
    } finally {
      setPosting(false);
    }
  }

  const backHref = currentMember.role === 'admin' ? '/admin/meetings'
                 : currentMember.role === 'employee' ? '/meetings'
                 : '/partner/meetings';

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-text-muted hover:text-text-primary text-xs transition-colors mb-4 px-2 py-2 -mx-2 sm:min-h-0 min-h-[44px] rounded-md hover:bg-surface-overlay"
        >
          <ChevronLeft className="w-4 h-4" />
          Voltar
        </Link>

        <MeetingPageHeader
          title={request.title}
          subtitle={`Solicitação #${request.id.slice(0, 8)}`}
          trailing={
            <div className="flex items-center gap-1.5">
              <MeetingPriorityBadge priority={request.priority as MeetingPriority} highOnly />
              <MeetingStatusBadge status={request.status as MeetingStatus} size="sm" />
            </div>
          }
        />

        {/* Card principal */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl p-5 mb-5">
          {/* Solicitante → Convidado */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <PersonChip label="Solicitante" member={requester} />
            <span className="text-text-muted">→</span>
            <PersonChip label="Convidado" member={partner} />
          </div>

          {/* Horario */}
          <MeetingTimeBlock startIso={startIso} endIso={endIso} rescheduled={useSuggested} className="mb-4" />

          {/* Descricao */}
          {request.description && (
            <div className="mb-4">
              <p className="text-text-secondary text-xs uppercase tracking-wider font-medium mb-1.5">Descrição</p>
              <p className="text-text-primary text-sm whitespace-pre-wrap">{request.description}</p>
            </div>
          )}

          {/* Motivo de rejeicao se houver */}
          {request.decision_reason && request.status === 'rejected' && (
            <div className="mb-4 p-3 rounded-lg border border-danger/30 bg-danger/5">
              <p className="text-danger text-xs uppercase tracking-wider font-medium mb-1">Motivo da rejeição</p>
              <p className="text-text-primary text-sm">{request.decision_reason}</p>
            </div>
          )}

          {/* Data completa */}
          <p className="text-text-muted text-xs mt-3">
            Criada em {formatMeetingDateLong(request.created_at)} às {formatMeetingTime(request.created_at)}
          </p>

          {/* Acoes */}
          {(canDecide || canCancel) && (
            <div className="mt-5 pt-4 border-t border-surface-border">
              {canDecide && (
                <>
                  <MeetingDecisionActions
                    busyAction={busyAction}
                    disabled={busyAction !== null || cancelling || suggesting}
                    onApprove={() => {
                      if (confirmApprove) void handleApprove();
                      else setConfirmApprove(true);
                    }}
                    onReject={() => void handleReject()}
                    approveLabel={confirmApprove ? 'Confirmar aprovação' : 'Aprovar'}
                    rejectLabel={rejectLabel}
                  />
                  {/* Sugerir outro horario (alternativa ao Aprovar/Rejeitar) */}
                  <div className="mt-3">
                    {!showSuggestForm ? (
                      <button
                        type="button"
                        onClick={() => {
                          setShowSuggestForm(true);
                          // Pre-fill com data proposta + 1 hora pra facilitar
                          if (!suggestStart) {
                            const d = new Date(request.proposed_start);
                            d.setHours(d.getHours() + 1);
                            const pad = (n: number) => n.toString().padStart(2, '0');
                            setSuggestStart(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
                          }
                        }}
                        disabled={busyAction !== null || cancelling}
                        className="text-xs font-medium px-3 py-2 rounded-md border border-info/40 text-info hover:bg-info/10 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        Sugerir outro horário
                      </button>
                    ) : (
                      <form
                        onSubmit={(e) => void handleSuggestReschedule(e)}
                        className="mt-3 p-4 rounded-lg border border-info/30 bg-info/5 space-y-3"
                      >
                        <p className="text-info text-xs uppercase tracking-wider font-medium">
                          Sugerir reagendamento
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label htmlFor="suggest-start" className="block text-text-secondary text-xs font-medium mb-1.5">
                              Novo horário
                            </label>
                            <input
                              id="suggest-start"
                              type="datetime-local"
                              value={suggestStart}
                              onChange={(e) => setSuggestStart(e.target.value)}
                              required
                              className="w-full px-3 py-2 bg-surface-base border border-surface-border rounded-md text-text-primary text-sm focus:outline-none focus:border-accent sm:min-h-0 min-h-[44px]"
                            />
                          </div>
                          <div>
                            <label htmlFor="suggest-duration" className="block text-text-secondary text-xs font-medium mb-1.5">
                              Duração
                            </label>
                            <select
                              id="suggest-duration"
                              value={suggestDuration}
                              onChange={(e) => setSuggestDuration(parseInt(e.target.value, 10))}
                              className="w-full px-3 py-2 bg-surface-base border border-surface-border rounded-md text-text-primary text-sm focus:outline-none focus:border-accent sm:min-h-0 min-h-[44px]"
                            >
                              <option value={30}>30 minutos</option>
                              <option value={60}>1 hora</option>
                              <option value={90}>1h 30min</option>
                              <option value={120}>2 horas</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label htmlFor="suggest-msg" className="block text-text-secondary text-xs font-medium mb-1.5">
                            Mensagem opcional
                          </label>
                          <textarea
                            id="suggest-msg"
                            value={suggestMessage}
                            onChange={(e) => setSuggestMessage(e.target.value)}
                            placeholder="Ex: nesse horário tenho mais disponibilidade…"
                            maxLength={2000}
                            rows={2}
                            className="w-full px-3 py-2 bg-surface-base border border-surface-border rounded-md text-text-primary text-sm placeholder:text-text-muted/60 focus:outline-none focus:border-accent resize-y"
                          />
                        </div>
                        <div className="flex gap-2 justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => { setShowSuggestForm(false); setSuggestMessage(''); }}
                            disabled={suggesting}
                            className="text-xs font-medium px-3 py-1.5 rounded-md border border-surface-border text-text-secondary hover:bg-surface-overlay transition-colors disabled:opacity-50 min-h-[36px]"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={suggesting || !suggestStart}
                            className="text-xs font-medium px-3 py-1.5 rounded-md bg-info/15 text-info border border-info/40 hover:bg-info/25 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5 min-h-[36px]"
                          >
                            {suggesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            Enviar sugestão
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                </>
              )}
              {canCancel && !canDecide && (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    disabled={cancelling || busyAction !== null}
                    onClick={() => {
                      if (confirmCancel) void handleCancel();
                      else setConfirmCancel(true);
                    }}
                    className={`text-xs font-medium px-3 py-1.5 rounded-md border ${confirmCancel ? 'border-danger/60 text-danger bg-danger/10' : 'border-surface-border text-text-secondary hover:border-danger/40 hover:text-danger'} transition-colors disabled:opacity-50 disabled:cursor-not-allowed sm:min-h-0 min-h-[44px] inline-flex items-center gap-1.5`}
                  >
                    {cancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                    {confirmCancel ? 'Confirmar cancelamento' : 'Cancelar solicitação'}
                  </button>
                  {confirmCancel && !cancelling && (
                    <button
                      type="button"
                      onClick={() => setConfirmCancel(false)}
                      className="text-xs text-text-muted hover:text-text-secondary px-2 py-1.5 min-h-[36px]"
                    >
                      Desistir
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Comentarios */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden mb-5">
          <div className="px-5 py-3 border-b border-surface-border flex items-center gap-2">
            <MessageCircle className="w-3.5 h-3.5 text-accent" />
            <span className="text-text-secondary text-xs uppercase tracking-wider font-medium">
              Comentários
            </span>
            <span className="text-accent font-semibold ml-1 text-xs">({comments.length})</span>
          </div>

          {comments.length === 0 ? (
            <div className="px-5 py-6 text-center text-text-muted text-sm">
              Nenhum comentário ainda. Seja o primeiro.
            </div>
          ) : (
            <ul className="divide-y divide-surface-border">
              {comments.map((c, idx) => {
                const author = memberById.get(c.author_id);
                return (
                  <motion.li
                    key={c.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                    className="px-5 py-3 flex items-start gap-3"
                  >
                    {author ? (
                      <MemberAvatar
                        member={{ name: author.name, colorHex: author.color_hex, avatarUrl: author.avatar_url }}
                        size="sm"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-surface-overlay flex items-center justify-center">
                        <User className="w-3.5 h-3.5 text-text-muted" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-text-primary text-xs">
                        <span className="font-medium">{author?.name ?? 'Desconhecido'}</span>
                        <span className="text-text-muted ml-2">{meetingTimeAgo(c.created_at)}</span>
                      </p>
                      <p className="text-text-secondary text-sm mt-0.5 whitespace-pre-wrap">{c.body}</p>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          )}

          {/* Form de novo comentario — gated por canComment */}
          {canComment ? (
            <form onSubmit={(e) => void handlePostComment(e)} className="border-t border-surface-border p-4 flex gap-2">
              <textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="Escreva um comentário…"
                maxLength={2000}
                rows={1}
                className="flex-1 px-3 py-2 bg-surface-base border border-surface-border rounded-md text-text-primary text-sm placeholder:text-text-muted/60 focus:outline-none focus:border-accent resize-y min-h-[40px] max-h-[200px]"
              />
              <button
                type="submit"
                disabled={posting || commentBody.trim().length < 1}
                className="text-xs font-medium px-3 rounded-md bg-accent text-brand hover:bg-accent-bright transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px] inline-flex items-center gap-1.5 shrink-0"
                style={{ color: '#0D1B2A' }}
              >
                {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Enviar
              </button>
            </form>
          ) : null}
        </div>

        {/* Histórico */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-border flex items-center gap-2">
            <History className="w-3.5 h-3.5 text-accent" />
            <span className="text-text-secondary text-xs uppercase tracking-wider font-medium">
              Histórico
            </span>
            <span className="text-accent font-semibold ml-1 text-xs">({history.length})</span>
          </div>

          {history.length === 0 ? (
            <div className="px-5 py-6 text-center text-text-muted text-sm">
              Sem eventos registrados.
            </div>
          ) : (
            <ol className="px-5 py-3 space-y-2 relative">
              {history.map((ev, idx) => {
                const actor = ev.actor_id ? memberById.get(ev.actor_id) : null;
                return (
                  <li key={ev.id} className="flex items-start gap-3 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-text-primary">
                        <span className="font-medium">{ACTION_LABEL[ev.action] ?? ev.action}</span>
                        {actor && <span className="text-text-muted"> por {actor.name}</span>}
                      </p>
                      <p className="text-text-muted text-[11px] mt-0.5">
                        {meetingTimeAgo(ev.created_at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

function PersonChip({
  label, member, subtle = false,
}: {
  label: string; member: MemberFields | null | undefined; subtle?: boolean;
}) {
  if (!member) return null;
  return (
    <div className="flex items-center gap-2">
      <MemberAvatar
        member={{ name: member.name, colorHex: member.color_hex, avatarUrl: member.avatar_url }}
        size="sm"
      />
      <div className="min-w-0">
        <p className={`text-[10px] uppercase tracking-wider ${subtle ? 'text-text-muted' : 'text-text-muted'}`}>
          {label}
        </p>
        <p className={`text-sm font-medium ${subtle ? 'text-text-secondary' : 'text-text-primary'}`}>
          {member.name}
        </p>
      </div>
    </div>
  );
}
