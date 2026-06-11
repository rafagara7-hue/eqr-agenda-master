'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Link2, Trash2, AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Seção pro sócio publicar URL iCal da própria Apple Calendar (ou Google,
 * Outlook web, etc) pra EQR Agenda ler os eventos pessoais dele.
 *
 * Direção: provider externo → EQR Agenda (read-only).
 *
 * Fluxo:
 *   1. Sócio publica o calendar dele no iCloud → ganha URL pública .ics
 *   2. Cola a URL aqui
 *   3. EQR Agenda valida (fetch + parsing) → salva → faz sync inicial
 *   4. Cron diário re-sincroniza
 *
 * Self-fetch:
 *   - Lê calendar_provider_accounts via supabase browser client (RLS filtra
 *     pra ver só linhas do próprio member)
 *   - Não precisa de endpoint GET novo
 */

interface Props {
  isMember: boolean;
  isAdmin: boolean;
}

interface IcalStatus {
  connected: boolean;
  url?: string;
  lastSyncedAt?: string | null;
  memberId?: string;
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'nunca';
  const last = new Date(iso).getTime();
  if (Number.isNaN(last)) return 'nunca';
  const diffMs = Date.now() - last;
  if (diffMs < 60_000) return 'agora há pouco';
  if (diffMs < 3_600_000) return `há ${Math.floor(diffMs / 60_000)}min`;
  if (diffMs < 86_400_000) return `há ${Math.floor(diffMs / 3_600_000)}h`;
  return `há ${Math.floor(diffMs / 86_400_000)} dias`;
}

export function MemberIcalSection({ isMember, isAdmin }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<IcalStatus>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [icalUrl, setIcalUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isMember || isAdmin) {
      setLoading(false);
      return;
    }
    void load();
  }, [isMember, isAdmin]);

  async function load() {
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data: rawMember } = await supabase
        .from('members')
        .select('id')
        .eq('user_id', user.id)
        .single();
      const member = rawMember as { id: string } | null;
      if (!member) {
        setLoading(false);
        return;
      }
      const { data: rawAccount } = await supabase
        .from('calendar_provider_accounts')
        .select('ical_url, last_synced_at')
        .eq('member_id', member.id)
        .eq('provider', 'microsoft')
        .not('ical_url', 'is', null)
        .maybeSingle();
      const account = rawAccount as { ical_url: string; last_synced_at: string | null } | null;
      setStatus({
        connected: Boolean(account?.ical_url),
        url: account?.ical_url,
        lastSyncedAt: account?.last_synced_at ?? null,
        memberId: member.id,
      });
    } catch (e) {
      console.error('[MemberIcalSection] load failed', e);
    } finally {
      setLoading(false);
    }
  }

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
    if (!status.memberId) {
      setError('Member não encontrado — recarregue a página');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/calendar/external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: status.memberId, icalUrl: trimmed }),
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
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro de rede');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisconnect() {
    if (
      !confirm(
        'Desconectar esse calendar? Os eventos sincronizados ficam no histórico mas param de atualizar.'
      )
    ) {
      return;
    }
    if (!status.memberId) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/calendar/external', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: status.memberId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Erro ao desconectar');
        return;
      }
      toast.success('Calendar desconectado');
      await load();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro de rede');
    } finally {
      setSubmitting(false);
    }
  }

  if (!isMember || isAdmin) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-surface-elevated border border-surface-border rounded-xl px-5"
    >
      <div className="py-4 border-b border-surface-border">
        <h2 className="text-text-secondary text-sm font-medium flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Apple Calendar (compartilhar agenda)
        </h2>
      </div>

      <div className="py-4 space-y-3">
        {loading ? (
          <p className="text-xs text-text-muted">Carregando…</p>
        ) : status.connected ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                <span className="text-sm font-medium text-text-primary">
                  Apple Calendar conectado
                </span>
              </div>
              <span className="text-[10px] text-text-muted whitespace-nowrap">
                atualizado {formatRelative(status.lastSyncedAt)}
              </span>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              Sync automático: cron diário 6h da manhã + atualização imediata quando alguém abre seu
              perfil ou calendário (throttle 5min). Read-only — eventos criados na EQR Agenda
              não vão pro seu Apple Calendar.
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
          </>
        ) : (
          <>
            <p className="text-xs text-text-muted leading-relaxed">
              Cole a URL iCal pública do seu Apple Calendar (ou Google/Outlook web). Seus
              eventos pessoais aparecem na EQR Agenda — read-only, atualiza a cada 6h.
            </p>

            <div className="space-y-2">
              <input
                type="url"
                value={icalUrl}
                onChange={(e) => {
                  setIcalUrl(e.target.value);
                  setError(null);
                }}
                placeholder="https://p23-calendars.icloud.com/published/.../calendar.ics"
                className="w-full px-3 py-2 bg-surface-base border border-surface-border rounded-lg text-text-primary text-xs font-mono placeholder:text-text-muted/60 focus:outline-none focus:border-accent transition-colors"
                disabled={submitting}
                spellCheck={false}
                autoComplete="off"
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
                {submitting ? 'Conectando…' : 'Conectar Apple Calendar'}
              </button>
            </div>

            <details className="text-xs text-text-muted pt-1">
              <summary className="cursor-pointer hover:text-text-secondary font-medium">
                Como pegar a URL do meu Apple Calendar
              </summary>
              <div className="mt-2 space-y-3 pl-2">
                <div>
                  <strong className="text-text-secondary">Apple Calendar (iCloud) — Mac:</strong>
                  <ol className="list-decimal list-inside mt-0.5 pl-2 space-y-0.5">
                    <li>Abre Calendar.app</li>
                    <li>
                      Clica com botão direito no calendar que quer compartilhar (na sidebar esquerda)
                    </li>
                    <li>Marca <strong>"Calendário público"</strong></li>
                    <li>Aparece URL <code>webcal://...</code> — copia ela</li>
                    <li>Troca <code>webcal://</code> por <code>https://</code> antes de colar aqui</li>
                  </ol>
                </div>
                <div>
                  <strong className="text-text-secondary">Apple Calendar — iCloud.com:</strong>
                  <ol className="list-decimal list-inside mt-0.5 pl-2 space-y-0.5">
                    <li>iCloud.com → Calendar</li>
                    <li>Clica no ícone "Compartilhar" do calendar (à esquerda do nome)</li>
                    <li>Marca <strong>"Calendário público"</strong></li>
                    <li>Copia o link gerado, troca <code>webcal://</code> por <code>https://</code></li>
                  </ol>
                  <a
                    href="https://www.icloud.com/calendar/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1 text-accent hover:underline"
                  >
                    Abrir iCloud Calendar <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </details>

            <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-warning/10 border border-warning/20">
              <AlertCircle className="w-3 h-3 text-warning flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-text-muted leading-snug">
                A URL é "secreta" — quem tiver acesso a ela vê seus eventos. Não compartilhe em
                locais públicos. Pra revogar, desmarca "Calendário público" no iCloud.
              </p>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
