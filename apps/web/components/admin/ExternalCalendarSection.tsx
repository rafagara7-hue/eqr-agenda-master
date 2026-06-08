'use client';

import { useState } from 'react';
import { Calendar, Link2, Trash2, AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

/**
 * Seção do perfil que conecta calendar externo do member (Google/Apple/Outlook/etc.)
 * via URL iCal. EQR Agenda passa a ler os eventos do feed externo e mostra no
 * dashboard. Direção: provider externo → EQR Agenda (read-only).
 *
 * Sócio cola URL .ics → backend valida (fetch + VCALENDAR) → salva e sincroniza.
 * Cron a cada 30min (ou menos, conforme vercel.json) refaz o fetch.
 */

interface Props {
  memberId: string;
  hasExternalCalendar: boolean; // true se já existe row iCal no DB pro member
  canManage: boolean;            // próprio member OU admin
}

export function ExternalCalendarSection({ memberId, hasExternalCalendar, canManage }: Props) {
  const router = useRouter();
  const [icalUrl, setIcalUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setError(null);
    const trimmed = icalUrl.trim();
    if (!trimmed) {
      setError('Cole a URL iCal do seu calendar');
      return;
    }
    if (!/^https:\/\//i.test(trimmed)) {
      setError('URL precisa começar com https://');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/calendar/external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, icalUrl: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        eventsFound?: number;
        synced?: number;
        warning?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Erro ao conectar');
        return;
      }
      if (data.warning) {
        toast.warning(`Conectado, mas houve aviso: ${data.warning}`);
      } else {
        toast.success(`Conectado — ${data.synced ?? 0} eventos sincronizados`);
      }
      setIcalUrl('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro de rede');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('Desconectar esse calendar? Os eventos sincronizados ficam no histórico mas param de atualizar.')) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/calendar/external', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Erro ao desconectar');
        return;
      }
      toast.success('Calendar externo desconectado');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro de rede');
    } finally {
      setSubmitting(false);
    }
  }

  if (!canManage) return null;

  if (hasExternalCalendar) {
    return (
      <div className="bg-surface-elevated border border-surface-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-success" />
          <h3 className="text-sm font-medium text-text-primary">Calendar externo conectado</h3>
        </div>
        <p className="text-xs text-text-muted leading-relaxed">
          Seus eventos são sincronizados a cada 30 minutos (cron). Eventos criados na EQR
          Agenda não vão pro seu calendar externo — sync é read-only.
        </p>
        <button
          type="button"
          onClick={() => void handleDisconnect()}
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-danger hover:bg-danger/10 border border-danger/30 transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {submitting ? 'Desconectando…' : 'Desconectar calendar'}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-surface-elevated border border-surface-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-text-muted" />
        <h3 className="text-sm font-medium text-text-primary">Conectar calendar externo</h3>
      </div>
      <p className="text-xs text-text-muted leading-relaxed">
        Cole a URL iCal pública do seu Google Calendar, Apple Calendar ou Outlook.
        Seus eventos pessoais aparecem na EQR Agenda (read-only, atualiza a cada 30min).
      </p>

      <div className="space-y-2">
        <input
          type="url"
          value={icalUrl}
          onChange={(e) => { setIcalUrl(e.target.value); setError(null); }}
          placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
          className="w-full px-3 py-2 bg-surface-base border border-surface-border rounded-lg text-text-primary text-xs font-mono placeholder:text-text-muted/60 focus:outline-none focus:border-accent transition-colors"
          disabled={submitting}
        />
        {error && (
          <div className="flex items-start gap-2 px-2.5 py-1.5 rounded-md bg-danger/10 border border-danger/30 text-danger text-xs">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => void handleConnect()}
          disabled={submitting || !icalUrl.trim()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-accent text-brand font-medium text-sm hover:bg-accent-bright transition-colors disabled:opacity-50"
          style={{ color: '#0D1B2A' }}
        >
          <Link2 className="w-3.5 h-3.5" />
          {submitting ? 'Conectando…' : 'Conectar'}
        </button>
      </div>

      <details className="text-xs text-text-muted">
        <summary className="cursor-pointer hover:text-text-secondary font-medium">
          Como pegar a URL iCal do meu calendar
        </summary>
        <div className="mt-2 space-y-3 pl-2">
          <div>
            <strong className="text-text-secondary">Google Calendar (gmail):</strong>
            <ol className="list-decimal list-inside mt-0.5 pl-2 space-y-0.5">
              <li>calendar.google.com → ⚙ Configurações</li>
              <li>"Configurações para minhas agendas" → escolhe sua agenda</li>
              <li>Rola até "Integrar agenda"</li>
              <li>Copia <strong>"Endereço secreto no formato iCal"</strong></li>
            </ol>
            <a
              href="https://calendar.google.com/calendar/u/0/r/settings"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-1 text-accent hover:underline"
            >
              Abrir configurações <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div>
            <strong className="text-text-secondary">Apple Calendar (iCloud):</strong>
            <ol className="list-decimal list-inside mt-0.5 pl-2 space-y-0.5">
              <li>iCloud.com → Calendar</li>
              <li>Clica no ícone do calendar à esquerda</li>
              <li>Marca "Calendário Público"</li>
              <li>Copia a URL gerada (mude o `webcal://` pra `https://`)</li>
            </ol>
          </div>
          <div>
            <strong className="text-text-secondary">Outlook.com (conta pessoal grátis):</strong>
            <ol className="list-decimal list-inside mt-0.5 pl-2 space-y-0.5">
              <li>outlook.live.com/calendar → ⚙ Configurações</li>
              <li>"Compartilhar e publicar" → escolhe agenda</li>
              <li>Permissão: "Pode ver títulos e horários" (ou mais)</li>
              <li>Clica <strong>Publicar</strong> → copia URL ICS</li>
            </ol>
          </div>
        </div>
      </details>

      <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-warning/10 border border-warning/20">
        <AlertCircle className="w-3 h-3 text-warning flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-text-muted leading-snug">
          A URL é "secreta" — quem tiver acesso a ela vê seus eventos. Não compartilhe
          em locais públicos. Pra revogar, gere uma nova URL no seu provider.
        </p>
      </div>
    </div>
  );
}
