'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  CalendarHeart,
  Link2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * Seção pro sócio conectar Apple Calendar via CalDAV (push real-time).
 *
 * Setup:
 *   1. Sócio abre appleid.apple.com → gera app-specific password
 *   2. Cola Apple ID + app password nessa seção
 *   3. EQR Agenda valida + persiste encriptado
 *   4. Daí em diante: eventos criados no EQR push pro Apple Calendar dele
 *      automaticamente
 *
 * Diferença vs iCal subscription:
 *   - CalDAV é real-time (segundos), iCal é polling (~1h)
 *   - CalDAV precisa app password (mais setup)
 *   - iCal precisa só de URL pública
 */

interface CalDAVStatus {
  connected: boolean;
  appleIdEmail?: string;
  calendarName?: string;
  verifiedAt?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  updatedAt?: string;
}

interface Props {
  isMember: boolean;
  isAdmin: boolean;
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

export function MemberCalDAVSection({ isMember, isAdmin }: Props) {
  const [status, setStatus] = useState<CalDAVStatus>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [appleId, setAppleId] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
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
      const res = await fetch('/api/calendar/caldav');
      const data = (await res.json()) as CalDAVStatus;
      setStatus(data);
      if (data.connected) {
        setAppleId(data.appleIdEmail ?? '');
        setShowForm(false);
      } else {
        setShowForm(true);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro de rede');
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    setError(null);
    if (!appleId.trim() || !appPassword.trim()) {
      setError('Preencha Apple ID + app password');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/calendar/caldav', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appleIdEmail: appleId.trim(),
          appPassword: appPassword.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        calendar?: { name: string };
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Erro ao conectar');
        return;
      }
      toast.success(
        `Conectado ao Apple Calendar "${data.calendar?.name ?? ''}". Eventos vão aparecer automaticamente.`
      );
      setAppPassword('');
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro de rede');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisconnect() {
    if (
      !confirm(
        'Desconectar Apple Calendar?\n\nEventos já sincronizados continuam no seu calendar, mas novos eventos do EQR Agenda não vão aparecer mais.'
      )
    )
      return;
    setDisconnecting(true);
    try {
      const res = await fetch('/api/calendar/caldav', { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Erro ao desconectar');
        return;
      }
      toast.success('Apple Calendar desconectado');
      setStatus({ connected: false });
      setAppleId('');
      setAppPassword('');
      setShowForm(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro de rede');
    } finally {
      setDisconnecting(false);
    }
  }

  if (!isMember || isAdmin) return null;

  const inputClass =
    'w-full px-3 py-2 bg-surface-base border border-surface-border rounded-lg text-text-primary text-sm placeholder:text-text-muted/60 focus:outline-none focus:border-accent transition-colors';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.32 }}
      className="bg-surface-elevated border border-surface-border rounded-xl px-5"
    >
      <div className="py-4 border-b border-surface-border">
        <h2 className="text-text-secondary text-sm font-medium flex items-center gap-2">
          <CalendarHeart className="w-4 h-4" />
          Push real-time pro Apple Calendar (CalDAV)
        </h2>
      </div>

      <div className="py-4 space-y-3">
        {loading ? (
          <p className="text-xs text-text-muted">Carregando…</p>
        ) : status.connected && !showForm ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                <span className="text-sm font-medium text-text-primary truncate">
                  Apple Calendar conectado
                </span>
              </div>
              <span className="text-[10px] text-text-muted whitespace-nowrap">
                verificado {formatRelative(status.verifiedAt)}
              </span>
            </div>
            <div className="text-xs text-text-muted space-y-1 pl-1">
              <div>
                <span className="text-text-secondary">Apple ID:</span> {status.appleIdEmail}
              </div>
              {status.calendarName && (
                <div>
                  <span className="text-text-secondary">Calendar destino:</span>{' '}
                  {status.calendarName}
                </div>
              )}
              {status.lastSyncAt && (
                <div>
                  <span className="text-text-secondary">Último sync:</span>{' '}
                  {formatRelative(status.lastSyncAt)}
                </div>
              )}
            </div>

            {status.lastError && (
              <div className="flex items-start gap-2 px-2.5 py-1.5 rounded-md bg-danger/10 border border-danger/30 text-danger text-xs">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>Última falha: {status.lastError}</span>
              </div>
            )}

            <p className="text-[11px] text-text-muted leading-relaxed">
              Quando alguém criar/aprovar reunião com você, evento aparece no seu Apple
              Calendar em segundos — sem precisar abrir email.
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="flex-1 min-w-[120px] flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-surface-overlay border border-surface-border text-text-primary text-sm hover:border-accent transition-colors"
              >
                Trocar credenciais
              </button>
              <button
                type="button"
                onClick={() => void handleDisconnect()}
                disabled={disconnecting}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-danger hover:bg-danger/10 border border-danger/30 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {disconnecting ? 'Desconectando…' : 'Desconectar'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-text-muted leading-relaxed">
              Conecte sua conta Apple pra receber eventos do EQR Agenda automaticamente.
              Setup leva ~2min na primeira vez.
            </p>

            {/* Passo a passo didático */}
            <div className="space-y-2 my-4">
              <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wide">
                Como configurar (1 vez)
              </h3>

              <div className="space-y-2 text-xs">
                <details
                  open
                  className="bg-surface-base border border-surface-border rounded-lg px-3 py-2"
                >
                  <summary className="cursor-pointer font-medium text-text-primary flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent text-brand font-bold text-[10px]" style={{ color: '#0D1B2A' }}>
                      1
                    </span>
                    Abrir Apple ID
                  </summary>
                  <div className="mt-2 pl-7 text-text-muted leading-relaxed">
                    Clique no botão abaixo (abre em nova aba).
                    <a
                      href="https://account.apple.com/account/manage"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-2 px-3 py-1.5 rounded-md bg-surface-overlay border border-surface-border text-text-primary hover:border-accent transition-colors font-medium"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Abrir account.apple.com
                    </a>
                  </div>
                </details>

                <details className="bg-surface-base border border-surface-border rounded-lg px-3 py-2">
                  <summary className="cursor-pointer font-medium text-text-primary flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent text-brand font-bold text-[10px]" style={{ color: '#0D1B2A' }}>
                      2
                    </span>
                    Gerar app-specific password
                  </summary>
                  <div className="mt-2 pl-7 text-text-muted leading-relaxed space-y-1">
                    <p>Depois de logar com Apple ID + senha + código 2FA:</p>
                    <ol className="list-decimal list-inside pl-2 space-y-0.5">
                      <li>
                        Na sidebar esquerda, clica em{' '}
                        <strong className="text-text-secondary">"Sign-In and Security"</strong>
                      </li>
                      <li>
                        Procura por{' '}
                        <strong className="text-text-secondary">"App-Specific Passwords"</strong>
                      </li>
                      <li>
                        Clica em <strong className="text-text-secondary">"Generate Password"</strong>{' '}
                        (ou o "+")
                      </li>
                      <li>
                        Dá um nome (sugerimos <code className="text-accent">EQR Agenda</code>)
                      </li>
                      <li>Apple gera senha tipo `abcd-efgh-ijkl-mnop` — copia ela inteira</li>
                    </ol>
                    <p className="text-warning text-[11px] mt-2">
                      ⚠ Apple só mostra essa senha 1 vez. Se perder, gera outra.
                    </p>
                  </div>
                </details>

                <details className="bg-surface-base border border-surface-border rounded-lg px-3 py-2">
                  <summary className="cursor-pointer font-medium text-text-primary flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent text-brand font-bold text-[10px]" style={{ color: '#0D1B2A' }}>
                      3
                    </span>
                    Colar aqui embaixo e conectar
                  </summary>
                  <div className="mt-2 pl-7 text-text-muted leading-relaxed">
                    Cole seu Apple ID (o email do iCloud) + a senha gerada no form abaixo.
                  </div>
                </details>
              </div>
            </div>

            {/* Form: passo 4 — preencher e conectar */}
            <div className="space-y-3 pt-2 border-t border-surface-border">
              <h3 className="text-xs font-bold text-accent uppercase tracking-wide flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent text-brand font-bold text-[10px]" style={{ color: '#0D1B2A' }}>
                  4
                </span>
                Conectar
              </h3>

              <div className="space-y-2">
                <label className="text-[11px] text-text-secondary font-medium">
                  Apple ID (email)
                </label>
                <input
                  type="email"
                  value={appleId}
                  onChange={(e) => setAppleId(e.target.value)}
                  placeholder="seu@icloud.com"
                  className={inputClass}
                  disabled={submitting}
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] text-text-secondary font-medium">
                  App-specific password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={appPassword}
                    onChange={(e) => setAppPassword(e.target.value)}
                    placeholder="abcd-efgh-ijkl-mnop"
                    className={inputClass + ' pr-10 font-mono'}
                    disabled={submitting}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 px-2.5 py-1.5 rounded-md bg-danger/10 border border-danger/30 text-danger text-xs">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleConnect()}
                  disabled={submitting || !appleId.trim() || !appPassword.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-accent text-brand font-medium text-sm hover:bg-accent-bright transition-colors disabled:opacity-50"
                  style={{ color: '#0D1B2A' }}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Conectando…
                    </>
                  ) : (
                    <>
                      <Link2 className="w-3.5 h-3.5" />
                      Conectar Apple Calendar
                    </>
                  )}
                </button>
                {status.connected && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setError(null);
                      setAppPassword('');
                    }}
                    disabled={submitting}
                    className="px-3 py-2 rounded-lg bg-surface-overlay border border-surface-border text-text-secondary text-sm hover:text-text-primary transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                )}
              </div>

              <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-warning/10 border border-warning/20">
                <AlertCircle className="w-3 h-3 text-warning flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-text-muted leading-snug">
                  <strong>Sua senha do iCloud NUNCA é pedida.</strong> Só a app-specific password
                  (que só dá acesso ao Calendar). Pra revogar, basta deletar no Apple ID.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
