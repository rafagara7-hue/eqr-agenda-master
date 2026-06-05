'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ChevronLeft, Send, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import { formatMeetingTime } from '@/lib/meetings/format';

interface PartnerLite {
  id: string;
  name: string;
  slug: string;
  color_hex: string;
  avatar_url: string | null;
  role: string;
}

interface Props {
  member: { id: string; name: string };
  partners: PartnerLite[];
  /** URL pra onde o botao Voltar/Cancelar leva. Default: /meetings */
  backHref?: string;
  /** URL pra onde redireciona apos submit OK. Default: /meetings */
  onSuccessHref?: string;
}

const PRIORITIES = [
  { value: 'low',    label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'high',   label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
] as const;

const DURATIONS = [
  { value: 30,  label: '30 minutos' },
  { value: 60,  label: '1 hora' },
  { value: 90,  label: '1h 30min' },
  { value: 120, label: '2 horas' },
];

interface BusySlot {
  member_id: string;
  start_at: string;
  end_at: string;
  status: string | null;
  title_if_public: string | null;
}

function defaultDateTime(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(14, 0, 0, 0);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function NewMeetingClient({
  partners,
  backHref = '/meetings',
  onSuccessHref = '/meetings',
}: Props) {
  const router = useRouter();
  const [targetId, setTargetId] = useState<string>('');
  const [nome, setNome] = useState('');
  const [assunto, setAssunto] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [start, setStart] = useState(defaultDateTime());
  const [duration, setDuration] = useState(60);
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [submitting, setSubmitting] = useState(false);

  // Conflict-check state — adiciona 'error' pra distinguir falha do check
  // (PR #23 audit: antes a falha era silenciosa e habilitava o submit).
  const [availStatus, setAvailStatus] = useState<'idle' | 'checking' | 'available' | 'conflict' | 'error'>('idle');
  const [conflicts, setConflicts] = useState<BusySlot[]>([]);
  const checkSeqRef = useRef(0);
  const checkingAvail = availStatus === 'checking';
  const availChecked = availStatus === 'available' || availStatus === 'conflict';

  // Funcao reusable de check — chamada por useEffect e pelo botao Retry
  const runAvailabilityCheck = useCallback(() => {
    if (!targetId || !start) {
      setConflicts([]);
      setAvailStatus('idle');
      return;
    }

    const startDate = new Date(start);
    const endDate = new Date(startDate);
    endDate.setMinutes(endDate.getMinutes() + duration);
    if (isNaN(startDate.getTime())) {
      setConflicts([]);
      setAvailStatus('idle');
      return;
    }

    const seq = ++checkSeqRef.current;
    setAvailStatus('checking');

    const dayStart = new Date(startDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(startDate);   dayEnd.setHours(23, 59, 59, 999);

    void (async () => {
      try {
        const params = new URLSearchParams({
          from: dayStart.toISOString(),
          to: dayEnd.toISOString(),
        });
        const res = await fetch(`/api/meetings/availability/${targetId}?${params}`);
        if (seq !== checkSeqRef.current) return;

        if (!res.ok) {
          console.warn('[availability] non-2xx', { status: res.status });
          setConflicts([]);
          setAvailStatus('error');
          return;
        }
        const data = await res.json() as { slots?: BusySlot[] };
        const slots = data.slots ?? [];

        const conflicting = slots.filter((s) => {
          if (!s.start_at || !s.end_at) return false;
          return overlaps(startDate, endDate, new Date(s.start_at), new Date(s.end_at));
        });
        setConflicts(conflicting);
        setAvailStatus(conflicting.length > 0 ? 'conflict' : 'available');
      } catch (err) {
        if (seq !== checkSeqRef.current) return;
        console.warn('[availability] check failed', err);
        setConflicts([]);
        setAvailStatus('error');
      }
    })();
  }, [targetId, start, duration]);

  // Re-checa quando inputs mudam
  useEffect(() => {
    runAvailabilityCheck();
  }, [runAvailabilityCheck]);

  const hasConflict = conflicts.length > 0;

  function calculateEnd(startIso: string, mins: number): string {
    const d = new Date(startIso);
    d.setMinutes(d.getMinutes() + mins);
    return d.toISOString();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetId)                       { toast.error('Selecione um sócio');                       return; }
    if (nome.trim().length < 3)          { toast.error('Nome deve ter pelo menos 3 caracteres');     return; }
    if (availStatus === 'checking')      { toast.error('Aguarde a verificação de disponibilidade');  return; }
    if (availStatus === 'error')         { toast.error('Não foi possível verificar disponibilidade — tente novamente'); return; }
    if (hasConflict)                     { toast.error('Horário ocupado. Escolha outro horário.');  return; }

    setSubmitting(true);
    try {
      const startIso = new Date(start).toISOString();
      const endIso = calculateEnd(start, duration);

      const res = await fetch('/api/meetings/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPartnerId: targetId,
          title: nome.trim(),
          description: assunto.trim() || undefined,
          observations: observacoes.trim() || undefined,
          proposedStart: startIso,
          proposedEnd: endIso,
          priority,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Erro ao enviar');
        setSubmitting(false);
        return;
      }
      toast.success('Solicitação enviada!');
      router.push(onSuccessHref);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro de rede');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <Link href={backHref} className="inline-flex items-center gap-1 text-text-muted hover:text-text-primary text-xs transition-colors mb-4 px-2 py-2 -mx-2 sm:min-h-0 min-h-[44px] rounded-md hover:bg-surface-overlay">
          <ChevronLeft className="w-4 h-4" />
          Voltar
        </Link>

        <h1 className="text-text-primary text-xl font-semibold mb-1">Nova solicitação</h1>
        <p className="text-text-muted text-sm mb-6">
          Preencha os detalhes. Admin ou o sócio destinatário decidem.
        </p>

        <form
          onSubmit={handleSubmit}
          className="bg-surface-elevated border border-surface-border rounded-xl p-5 space-y-5"
        >
          {/* Membro */}
          <div>
            <label className="block text-text-secondary text-xs uppercase tracking-wider font-medium mb-2">
              Membro <span className="text-accent">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {partners.map((p) => (
                <motion.button
                  key={p.id}
                  type="button"
                  onClick={() => setTargetId(p.id)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                    targetId === p.id
                      ? 'border-accent bg-accent/10'
                      : 'border-surface-border bg-surface-overlay hover:border-surface-muted'
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <MemberAvatar
                    member={{ name: p.name, colorHex: p.color_hex, avatarUrl: p.avatar_url }}
                    size="md"
                  />
                  <span className="text-text-primary text-xs font-medium">{p.name}</span>
                  <span className="text-text-muted text-[10px] uppercase tracking-wider">
                    {p.role === 'admin' ? 'Admin' : 'Sócio'}
                  </span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Nome */}
          <div>
            <label htmlFor="nome" className="block text-text-secondary text-xs uppercase tracking-wider font-medium mb-2">
              Nome <span className="text-accent">*</span>
            </label>
            <input
              id="nome"
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Reunião sobre proposta cliente X"
              maxLength={200}
              className="w-full px-3 py-2.5 bg-surface-base border border-surface-border rounded-lg text-text-primary text-sm placeholder:text-text-muted/60 focus:outline-none focus:border-accent"
              required
            />
          </div>

          {/* Assunto */}
          <div>
            <label htmlFor="assunto" className="block text-text-secondary text-xs uppercase tracking-wider font-medium mb-2">
              Assunto
            </label>
            <textarea
              id="assunto"
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
              placeholder="O que vai ser discutido?"
              maxLength={2000}
              rows={3}
              className="w-full px-3 py-2.5 bg-surface-base border border-surface-border rounded-lg text-text-primary text-sm placeholder:text-text-muted/60 focus:outline-none focus:border-accent resize-y"
            />
          </div>

          {/* Horário e data */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="start" className="block text-text-secondary text-xs uppercase tracking-wider font-medium mb-2">
                Horário e data <span className="text-accent">*</span>
              </label>
              <input
                id="start"
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full px-3 py-2.5 bg-surface-base border border-surface-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                required
              />
            </div>
            <div>
              <label htmlFor="duration" className="block text-text-secondary text-xs uppercase tracking-wider font-medium mb-2">
                Duração
              </label>
              <select
                id="duration"
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2.5 bg-surface-base border border-surface-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
              >
                {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
          </div>

          {/* Conflict / Available banner — só aparece se já há sócio + horário escolhidos */}
          {targetId && start && (
            <div>
              {checkingAvail ? (
                <div className="px-3 py-2.5 rounded-lg border border-surface-border bg-surface-overlay text-text-muted text-xs flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Verificando agenda do sócio…
                </div>
              ) : availStatus === 'error' ? (
                <div className="px-3 py-2.5 rounded-lg border border-warning/40 bg-warning/10 text-warning text-xs flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span>Não foi possível verificar disponibilidade.</span>
                    <button
                      type="button"
                      onClick={() => runAvailabilityCheck()}
                      className="text-xs font-medium px-3 py-1.5 rounded-md border border-warning/50 hover:bg-warning/20 transition-colors min-h-[32px] inline-flex items-center justify-center gap-1.5 self-start sm:self-auto"
                    >
                      <Loader2 className="w-3 h-3" />
                      Tentar novamente
                    </button>
                  </div>
                </div>
              ) : hasConflict ? (
                <div className="px-3 py-2.5 rounded-lg border border-danger/40 bg-danger/10 text-danger text-xs flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium mb-1">Horário ocupado. Escolha outro horário.</p>
                    <ul className="space-y-0.5 text-[11px] text-danger/80">
                      {conflicts.slice(0, 3).map((c) => (
                        <li key={c.start_at + c.end_at}>
                          • {formatMeetingTime(c.start_at)} – {formatMeetingTime(c.end_at)}
                          {c.title_if_public && <span className="text-text-muted ml-1">({c.title_if_public})</span>}
                        </li>
                      ))}
                      {conflicts.length > 3 && <li>• +{conflicts.length - 3} outros</li>}
                    </ul>
                  </div>
                </div>
              ) : availChecked ? (
                <div className="px-3 py-2.5 rounded-lg border border-success/30 bg-success/10 text-success text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Horário disponível.
                </div>
              ) : null}
            </div>
          )}

          {/* Observações */}
          <div>
            <label htmlFor="observacoes" className="block text-text-secondary text-xs uppercase tracking-wider font-medium mb-2">
              Observações
            </label>
            <textarea
              id="observacoes"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Notas adicionais, contexto, anexos…"
              maxLength={2000}
              rows={2}
              className="w-full px-3 py-2.5 bg-surface-base border border-surface-border rounded-lg text-text-primary text-sm placeholder:text-text-muted/60 focus:outline-none focus:border-accent resize-y"
            />
          </div>

          {/* Prioridade */}
          <div>
            <label htmlFor="priority" className="block text-text-secondary text-xs uppercase tracking-wider font-medium mb-2">
              Prioridade
            </label>
            <select
              id="priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
              className="w-full px-3 py-2.5 bg-surface-base border border-surface-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
            >
              {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-surface-border">
            <Link
              href={backHref}
              className="text-xs font-medium px-4 py-2.5 rounded-md border border-surface-border text-text-secondary hover:border-surface-muted hover:text-text-primary transition-colors min-h-[40px] flex items-center"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={submitting || !targetId || nome.trim().length < 3 || hasConflict || checkingAvail || availStatus === 'error'}
              className="text-xs font-medium px-4 py-2.5 rounded-md bg-accent text-brand hover:bg-accent-bright transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px] flex items-center gap-2"
              style={{ color: '#0D1B2A' }}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Enviar solicitação
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
