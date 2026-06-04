'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ChevronLeft, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { MemberAvatar } from '@/components/shared/MemberAvatar';

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
}

const PRIORITIES = [
  { value: 'low',    label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'high',   label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
] as const;

const DURATIONS = [
  { value: 30, label: '30 minutos' },
  { value: 60, label: '1 hora' },
  { value: 90, label: '1h 30min' },
  { value: 120, label: '2 horas' },
];

function defaultDateTime(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(14, 0, 0, 0);
  // Format pra <input type="datetime-local">
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NewMeetingClient({ partners }: Props) {
  const router = useRouter();
  const [targetId, setTargetId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState(defaultDateTime());
  const [duration, setDuration] = useState(60);
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [submitting, setSubmitting] = useState(false);

  function calculateEnd(startIso: string, mins: number): string {
    const d = new Date(startIso);
    d.setMinutes(d.getMinutes() + mins);
    return d.toISOString();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetId) { toast.error('Selecione um sócio'); return; }
    if (title.trim().length < 3) { toast.error('Título deve ter pelo menos 3 caracteres'); return; }

    setSubmitting(true);
    try {
      const startIso = new Date(start).toISOString();
      const endIso = calculateEnd(start, duration);

      const res = await fetch('/api/meetings/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPartnerId: targetId,
          title: title.trim(),
          description: description.trim() || undefined,
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
      router.push('/meetings');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro de rede');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <Link href="/meetings" className="inline-flex items-center gap-1 text-text-muted hover:text-text-primary text-xs transition-colors mb-4">
          <ChevronLeft className="w-4 h-4" />
          Voltar
        </Link>

        <h1 className="text-text-primary text-xl font-semibold mb-1">Nova solicitação</h1>
        <p className="text-text-muted text-sm mb-6">
          Preencha os detalhes e envie. Admin ou o sócio destinatário decidem.
        </p>

        <form
          onSubmit={handleSubmit}
          className="bg-surface-elevated border border-surface-border rounded-xl p-5 space-y-5"
        >
          {/* Com quem */}
          <div>
            <label className="block text-text-secondary text-xs uppercase tracking-wider font-medium mb-2">
              Com quem? <span className="text-accent">*</span>
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

          {/* Titulo */}
          <div>
            <label htmlFor="title" className="block text-text-secondary text-xs uppercase tracking-wider font-medium mb-2">
              Título da reunião <span className="text-accent">*</span>
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Discussão sobre proposta cliente X"
              maxLength={200}
              className="w-full px-3 py-2.5 bg-surface-base border border-surface-border rounded-lg text-text-primary text-sm placeholder:text-text-muted/60 focus:outline-none focus:border-accent"
              required
            />
          </div>

          {/* Descricao */}
          <div>
            <label htmlFor="description" className="block text-text-secondary text-xs uppercase tracking-wider font-medium mb-2">
              Descrição
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="O que vocês vão discutir?"
              maxLength={5000}
              rows={3}
              className="w-full px-3 py-2.5 bg-surface-base border border-surface-border rounded-lg text-text-primary text-sm placeholder:text-text-muted/60 focus:outline-none focus:border-accent resize-y"
            />
          </div>

          {/* Data e duracao */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="start" className="block text-text-secondary text-xs uppercase tracking-wider font-medium mb-2">
                Início <span className="text-accent">*</span>
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
              href="/meetings"
              className="text-xs font-medium px-4 py-2.5 rounded-md border border-surface-border text-text-secondary hover:border-surface-muted hover:text-text-primary transition-colors min-h-[40px] flex items-center"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={submitting || !targetId || title.trim().length < 3}
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
