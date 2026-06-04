'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Send, Loader2, AlertTriangle, CheckCircle2, Phone } from 'lucide-react';
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
  partners: PartnerLite[];
}

interface BusySlot {
  start_at: string;
  end_at: string;
}

const DURATIONS = [
  { value: 30,  label: '30 minutos' },
  { value: 60,  label: '1 hora' },
  { value: 90,  label: '1h 30min' },
  { value: 120, label: '2 horas' },
];

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

function formatPhone(raw: string): string {
  // Mascara simples BR: (XX) XXXXX-XXXX. Sem zod, so estetica.
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function PublicBookingForm({ partners }: Props) {
  const router = useRouter();
  const [targetId, setTargetId] = useState<string>('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [assunto, setAssunto] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [start, setStart] = useState(defaultDateTime());
  const [duration, setDuration] = useState(60);
  const [submitting, setSubmitting] = useState(false);
  const [doneId, setDoneId] = useState<string | null>(null);

  const [checkingAvail, setCheckingAvail] = useState(false);
  const [conflicts, setConflicts] = useState<BusySlot[]>([]);
  const [availChecked, setAvailChecked] = useState(false);
  const checkSeqRef = useRef(0);

  // Conflict check quando socio + horario + duracao mudam
  useEffect(() => {
    if (!targetId || !start) {
      setConflicts([]);
      setAvailChecked(false);
      return;
    }
    const startDate = new Date(start);
    const endDate = new Date(startDate);
    endDate.setMinutes(endDate.getMinutes() + duration);
    if (isNaN(startDate.getTime())) {
      setConflicts([]);
      setAvailChecked(false);
      return;
    }

    const seq = ++checkSeqRef.current;
    setCheckingAvail(true);

    const dayStart = new Date(startDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(startDate);   dayEnd.setHours(23, 59, 59, 999);

    void (async () => {
      try {
        const params = new URLSearchParams({
          from: dayStart.toISOString(),
          to: dayEnd.toISOString(),
        });
        const res = await fetch(`/api/public/availability/${targetId}?${params}`);
        if (seq !== checkSeqRef.current) return;
        if (!res.ok) {
          setConflicts([]);
          setAvailChecked(false);
          return;
        }
        const data = await res.json() as { slots?: BusySlot[] };
        const slots = data.slots ?? [];
        const conflicting = slots.filter((s) => {
          if (!s.start_at || !s.end_at) return false;
          return overlaps(startDate, endDate, new Date(s.start_at), new Date(s.end_at));
        });
        setConflicts(conflicting);
        setAvailChecked(true);
      } catch {
        setConflicts([]);
        setAvailChecked(false);
      } finally {
        if (seq === checkSeqRef.current) setCheckingAvail(false);
      }
    })();
  }, [targetId, start, duration]);

  const hasConflict = conflicts.length > 0;
  const phoneDigits = telefone.replace(/\D/g, '');
  const formValid =
    !!targetId
    && nome.trim().length >= 2
    && phoneDigits.length >= 8
    && assunto.trim().length >= 3
    && !!start
    && !hasConflict
    && !checkingAvail;

  function calculateEnd(startIso: string, mins: number): string {
    const d = new Date(startIso);
    d.setMinutes(d.getMinutes() + mins);
    return d.toISOString();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formValid) return;
    setSubmitting(true);
    try {
      const startIso = new Date(start).toISOString();
      const endIso = calculateEnd(start, duration);

      const res = await fetch('/api/public/meeting-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalName: nome.trim(),
          externalPhone: telefone.trim(),
          targetPartnerId: targetId,
          title: assunto.trim(),
          proposedStart: startIso,
          proposedEnd: endIso,
          description: undefined,
          observations: observacoes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Erro ao enviar');
        setSubmitting(false);
        return;
      }
      setDoneId(data.id as string);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro de rede');
      setSubmitting(false);
    }
  }

  // Tela de confirmacao apos submit
  if (doneId) {
    return (
      <div className="flex-1 p-4 sm:p-6">
        <div className="max-w-md mx-auto mt-12">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface-elevated border border-surface-border rounded-xl p-6 text-center"
          >
            <div className="inline-flex w-14 h-14 rounded-full bg-success/15 items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-success" />
            </div>
            <h2 className="text-text-primary text-lg font-semibold mb-2">
              Solicitação enviada!
            </h2>
            <p className="text-text-secondary text-sm mb-4">
              Recebemos seu pedido. O sócio entrará em contato em breve pelo telefone informado.
            </p>
            <p className="text-text-muted text-xs">
              Protocolo: <span className="text-accent font-mono">{doneId.slice(0, 8).toUpperCase()}</span>
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-text-primary text-xl font-semibold">Solicitar reunião</h1>
          <p className="text-text-muted text-sm mt-1">
            Preencha o formulário. O sócio entrará em contato pelo telefone informado.
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="bg-surface-elevated border border-surface-border rounded-xl p-5 space-y-5">
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
              placeholder="Seu nome completo"
              maxLength={120}
              autoComplete="name"
              required
              className="w-full px-3 py-2.5 bg-surface-base border border-surface-border rounded-lg text-text-primary text-sm placeholder:text-text-muted/60 focus:outline-none focus:border-accent"
            />
          </div>

          {/* Telefone */}
          <div>
            <label htmlFor="telefone" className="block text-text-secondary text-xs uppercase tracking-wider font-medium mb-2">
              Telefone <span className="text-accent">*</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                id="telefone"
                type="tel"
                value={telefone}
                onChange={(e) => setTelefone(formatPhone(e.target.value))}
                placeholder="(11) 99999-9999"
                inputMode="numeric"
                autoComplete="tel"
                required
                className="w-full pl-9 pr-3 py-2.5 bg-surface-base border border-surface-border rounded-lg text-text-primary text-sm placeholder:text-text-muted/60 focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* Assunto */}
          <div>
            <label htmlFor="assunto" className="block text-text-secondary text-xs uppercase tracking-wider font-medium mb-2">
              Assunto <span className="text-accent">*</span>
            </label>
            <input
              id="assunto"
              type="text"
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
              placeholder="Ex: Discussão sobre proposta"
              maxLength={200}
              required
              className="w-full px-3 py-2.5 bg-surface-base border border-surface-border rounded-lg text-text-primary text-sm placeholder:text-text-muted/60 focus:outline-none focus:border-accent"
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
                required
                className="w-full px-3 py-2.5 bg-surface-base border border-surface-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
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

          {/* Conflict / availability banner */}
          {targetId && start && (
            <div>
              {checkingAvail ? (
                <div className="px-3 py-2.5 rounded-lg border border-surface-border bg-surface-overlay text-text-muted text-xs flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Verificando agenda do sócio…
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
              placeholder="Contexto, anexos, links…"
              maxLength={2000}
              rows={3}
              className="w-full px-3 py-2.5 bg-surface-base border border-surface-border rounded-lg text-text-primary text-sm placeholder:text-text-muted/60 focus:outline-none focus:border-accent resize-y"
            />
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-surface-border">
            <button
              type="submit"
              disabled={submitting || !formValid}
              className="text-sm font-medium px-5 py-2.5 rounded-md bg-accent text-brand hover:bg-accent-bright transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] flex items-center gap-2"
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
