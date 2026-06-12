'use client';

import { useEffect, useRef, useState } from 'react';
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
  Clipboard,
} from 'lucide-react';
import { toast } from 'sonner';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

// Strip caracteres invisíveis que copy-paste de mobile/Mac injeta (zero-width,
// NBSP, BOM). Sem isso, mesmo um Apple ID visualmente correto pode falhar na
// validação de email do backend.
function normalizeInput(s: string): string {
  return s
    .replace(/[​-‍﻿]/g, '')
    .replace(/ /g, ' ')
    .trim();
}

/**
 * Versão simplificada: 2 cards (Gerar password, Conectar) em vez de 4 passos.
 *
 * UX improvements:
 *   - Auto pre-fill Apple ID com email atual do user
 *   - Botão "Colar" pega do clipboard (sócio acabou de copiar do Apple)
 *   - Validação de formato em real-time (xxxx-xxxx-xxxx-xxxx)
 *   - Indicador visual ✓ formato OK
 *   - Senha mostra/oculta inline
 *   - Botão grande "Abrir Apple ID" centralizado
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

const APP_PASSWORD_FORMAT = /^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$/i;

function isValidAppPassword(s: string): boolean {
  return APP_PASSWORD_FORMAT.test(s.trim());
}

/**
 * Tenta auto-formatar enquanto user digita: insere hífens a cada 4 chars.
 * Aceita user digitar "abcdefghijklmnop" → "abcd-efgh-ijkl-mnop".
 *
 * IMPORTANTE: normalizeInput() é aplicado ANTES (remove invisíveis); só então
 * fazemos lowercase + filter a-z. Ordem inversa silenciosamente comeria chars
 * válidos que vinham junto com invisíveis no clipboard.
 */
function autoFormatPassword(s: string): string {
  const cleaned = normalizeInput(s).toLowerCase().replace(/[^a-z]/g, '').slice(0, 16);
  return cleaned.replace(/(.{4})(?=.)/g, '$1-');
}

export function MemberCalDAVSection({ isMember, isAdmin }: Props) {
  const [status, setStatus] = useState<CalDAVStatus>({ connected: false });
  const [loading, setLoading] = useState(true);
  // showForm = false → mostra só o botão "Conectar"; true → mostra os 2 cards
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
      }
      // Quando NÃO conectado: showForm fica false (default) → mostra só botão
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro de rede');
    } finally {
      setLoading(false);
    }
  }

  const passwordInputRef = useRef<HTMLInputElement>(null);
  const autoConnectTriggeredRef = useRef(false);

  async function openSetup() {
    setShowForm(true);
    setError(null);
    // Pre-fill Apple ID com email do user se ainda não tiver
    if (!appleId) {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) setAppleId(user.email);
      } catch {}
    }
    // NÃO abre Apple ID auto — sócio precisa ler as instruções primeiro.
    // Botão "Abrir Apple ID" no card 1 abre quando ele tiver entendido o que fazer.
  }

  function openAppleIdTab() {
    window.open('https://account.apple.com/account/manage', '_blank', 'noopener');
    setTimeout(() => passwordInputRef.current?.focus(), 300);
  }

  // OTIMIZAÇÃO 3: quando user voltar pra essa aba (depois de copiar do Apple),
  // tenta auto-paste do clipboard se ainda não preencheu senha
  useEffect(() => {
    if (!showForm) return;
    async function tryClipboardOnFocus() {
      if (appPassword) return; // já tem senha
      if (document.visibilityState !== 'visible') return;
      try {
        // Permission API check antes de tentar (evita prompt invasivo)
        const perm = await navigator.permissions
          .query({ name: 'clipboard-read' as PermissionName })
          .catch(() => null);
        if (perm && perm.state === 'denied') return;
        const text = (await navigator.clipboard.readText()).trim();
        if (!text) return;
        const formatted = autoFormatPassword(text);
        if (isValidAppPassword(formatted)) {
          setAppPassword(formatted);
          toast.success('Senha colada do clipboard — revise e clique em Conectar');
          // Auto-connect removido (era 800ms setTimeout): clipboard pode ter
          // dado corrompido + auto-submit é dark pattern. User vê o valor
          // formatado, confirma visualmente, e clica Conectar.
        }
      } catch {
        // Sem permissão / não suportado — ignora silenciosamente
      }
    }
    function onVisibilityChange() {
      void tryClipboardOnFocus();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm, appPassword]);

  async function handleConnect() {
    setError(null);
    if (!appleId.trim() || !appPassword.trim()) {
      setError('Preencha Apple ID + app password');
      return;
    }
    if (!isValidAppPassword(appPassword.trim())) {
      setError('App password tem formato xxxx-xxxx-xxxx-xxxx (16 letras + hífens)');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/calendar/caldav', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appleIdEmail: normalizeInput(appleId),
          appPassword: normalizeInput(appPassword),
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
        `Conectado! Eventos vão aparecer no "${data.calendar?.name ?? 'seu calendar'}" automaticamente.`
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
        'Desconectar Apple Calendar?\n\nEventos já sincronizados continuam no seu calendar, mas novos eventos do EQR não vão aparecer mais.'
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
      setAppPassword('');
      setShowForm(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro de rede');
    } finally {
      setDisconnecting(false);
    }
  }

  async function handlePasteFromClipboard() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        toast.info('Clipboard vazio');
        return;
      }
      const formatted = autoFormatPassword(text);
      setAppPassword(formatted);
      if (isValidAppPassword(formatted)) {
        toast.success('Senha colada (formato válido)');
      } else {
        toast.warning('Colei o texto mas não parece ser uma app-password Apple');
      }
    } catch {
      toast.error('Não consegui ler o clipboard. Cola manual com Ctrl+V.');
    }
  }

  if (!isMember || isAdmin) return null;

  const inputClass =
    'w-full px-3 py-2 bg-surface-base border border-surface-border rounded-lg text-text-primary text-sm placeholder:text-text-muted/60 focus:outline-none focus:border-accent transition-colors';
  const passwordValid = isValidAppPassword(appPassword);
  const passwordEmpty = appPassword.length === 0;

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
          Sincronizar com Apple Calendar
        </h2>
      </div>

      <div className="py-4 space-y-4">
        {loading ? (
          <p className="text-xs text-text-muted">Carregando…</p>
        ) : status.connected && !showForm ? (
          <ConnectedView
            status={status}
            onEdit={() => setShowForm(true)}
            onDisconnect={() => void handleDisconnect()}
            disconnecting={disconnecting}
          />
        ) : !showForm ? (
          // Estado inicial: só botão grande "Conectar"
          <div className="space-y-3">
            <p className="text-xs text-text-muted leading-relaxed">
              Receba reuniões do EQR direto no seu Apple Calendar, sem precisar abrir email.
            </p>
            <button
              type="button"
              onClick={() => void openSetup()}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-accent text-brand font-medium text-sm hover:bg-accent-bright transition-colors"
              style={{ color: '#0D1B2A' }}
            >
              <Link2 className="w-4 h-4" />
              Conectar Apple Calendar (abre Apple ID auto)
            </button>
            <p className="text-[10px] text-text-muted text-center">
              ~1min · Apple ID abre auto · Senha do iCloud nunca é pedida
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-text-muted leading-relaxed">
                Conecte sua conta Apple. Setup leva ~1min.
              </p>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setError(null);
                  setAppPassword('');
                }}
                disabled={submitting}
                className="text-[11px] text-text-muted hover:text-text-secondary transition-colors flex-shrink-0"
              >
                ← voltar
              </button>
            </div>

            {/* Passo 1: instruções + botão abrir Apple ID */}
            <div className="bg-accent/10 border border-accent/30 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-2">
                <div
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-accent font-bold text-xs flex-shrink-0"
                  style={{ color: '#0D1B2A' }}
                >
                  1
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-text-primary text-sm font-semibold leading-snug">
                    Gera a senha no seu Apple ID
                  </p>
                  <p className="text-text-muted text-[11px] mt-1.5 leading-relaxed">
                    Quando clicar no botão abaixo, abre uma nova aba. Lá:
                  </p>
                  <ol className="text-text-muted text-[11px] mt-1 leading-relaxed list-decimal list-inside pl-1 space-y-0.5">
                    <li>Login com Apple ID + verificação em duas etapas</li>
                    <li>
                      Menu lateral →{' '}
                      <strong className="text-text-secondary">Início de sessão e segurança</strong>
                    </li>
                    <li>
                      Clica em{' '}
                      <strong className="text-text-secondary">Senhas específicas de apps</strong>
                    </li>
                    <li>
                      <strong className="text-text-secondary">Gerar senha</strong> → dá um nome
                      (ex: <code className="text-accent">EQR Agenda</code>)
                    </li>
                    <li>Copia a senha gerada e volta aqui</li>
                  </ol>
                </div>
              </div>
              <button
                type="button"
                onClick={openAppleIdTab}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-surface-base border border-accent/40 text-text-primary text-sm font-medium hover:border-accent hover:bg-accent/5 transition-colors"
              >
                <ExternalLink className="w-4 h-4 text-accent" />
                Abrir Apple ID em nova aba
              </button>
            </div>

            {/* CARD: Conectar (passo 2 — colar senha) */}
            <div className="bg-surface-base border border-surface-border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-accent font-bold text-xs"
                  style={{ color: '#0D1B2A' }}
                >
                  2
                </span>
                <h3 className="text-sm font-medium text-text-primary">
                  Conectar EQR Agenda ao seu calendar
                </h3>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] text-text-secondary font-medium">
                  Apple ID (email do iCloud)
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
                <p className="text-[10px] text-text-muted">
                  Geralmente o mesmo email da sua conta (já pré-preenchido)
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-text-secondary font-medium">
                    App password
                  </label>
                  <button
                    type="button"
                    onClick={() => void handlePasteFromClipboard()}
                    disabled={submitting}
                    className="flex items-center gap-1 text-[10px] text-accent hover:text-accent-bright transition-colors disabled:opacity-50"
                  >
                    <Clipboard className="w-3 h-3" />
                    Colar do clipboard
                  </button>
                </div>
                <div className="relative">
                  <input
                    ref={passwordInputRef}
                    type={showPassword ? 'text' : 'password'}
                    value={appPassword}
                    onChange={(e) => {
                      setAppPassword(autoFormatPassword(e.target.value));
                      autoConnectTriggeredRef.current = false;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && isValidAppPassword(appPassword) && appleId.trim()) {
                        e.preventDefault();
                        void handleConnect();
                      }
                    }}
                    placeholder="abcd-efgh-ijkl-mnop"
                    className={
                      inputClass +
                      ' pr-16 font-mono ' +
                      (passwordEmpty
                        ? ''
                        : passwordValid
                          ? 'border-success'
                          : 'border-warning')
                    }
                    disabled={submitting}
                    autoComplete="new-password"
                    maxLength={19}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {!passwordEmpty && passwordValid && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                    )}
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-text-muted hover:text-text-primary transition-colors"
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
                {!passwordEmpty && (
                  <p
                    className={`text-[10px] ${
                      passwordValid ? 'text-success' : 'text-warning'
                    }`}
                  >
                    {passwordValid
                      ? '✓ Formato válido'
                      : `Faltam ${16 - appPassword.replace(/[^a-z]/gi, '').length} letras`}
                  </p>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 px-2.5 py-1.5 rounded-md bg-danger/10 border border-danger/30 text-danger text-xs">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void handleConnect()}
                  disabled={submitting || !appleId.trim() || !passwordValid}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-accent text-brand font-medium text-sm hover:bg-accent-bright transition-colors disabled:opacity-50"
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
                      Conectar
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
                    className="px-3 py-2.5 rounded-lg bg-surface-overlay border border-surface-border text-text-secondary text-sm hover:text-text-primary transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-surface-overlay/50 border border-surface-border">
              <AlertCircle className="w-3 h-3 text-text-muted flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-text-muted leading-snug">
                <strong className="text-text-secondary">Sua senha do iCloud nunca é pedida.</strong>
                {' '}Só a app password (que só acessa Calendar). Pra revogar, é só apagar no Apple
                ID — leva 2 cliques.
              </p>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

function ConnectedView({
  status,
  onEdit,
  onDisconnect,
  disconnecting,
}: {
  status: CalDAVStatus;
  onEdit: () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  return (
    <div className="space-y-3">
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
            <span className="text-text-secondary">Calendar:</span> {status.calendarName}
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
        Reuniões marcadas com você aparecem no Apple Calendar em segundos. Funciona no Mac,
        iPhone e iPad automaticamente.
      </p>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 min-w-[120px] flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-surface-overlay border border-surface-border text-text-primary text-sm hover:border-accent transition-colors"
        >
          Trocar app password
        </button>
        <button
          type="button"
          onClick={onDisconnect}
          disabled={disconnecting}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-danger hover:bg-danger/10 border border-danger/30 transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {disconnecting ? 'Desconectando…' : 'Desconectar'}
        </button>
      </div>
    </div>
  );
}
