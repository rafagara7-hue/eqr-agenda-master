'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarHeart,
  Link2,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Clipboard,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

// Strip caracteres invisíveis que copy-paste de mobile/Mac injeta (zero-width,
// NBSP, BOM). Sem isso, mesmo um Apple ID visualmente correto pode falhar na
// validação de email do backend.
function normalizeInput(s: string): string {
  return s
    .replace(/[​-‍﻿]/g, '')
    .replace(/ /g, ' ')
    .trim();
}

/**
 * Modal didático que abre direto no /calendar.
 *
 * Faz a conexão CalDAV inteira sem sair da página:
 *   - Auto-abre Apple ID em nova aba ao montar
 *   - Pre-fill Apple ID com email do user
 *   - Auto-paste do clipboard quando user volta pra aba
 *   - Validação real-time da app-password
 *   - Senha auto-detectada do clipboard; user confirma e clica Conectar
 *   - Enter pra submit
 *   - Click fora ou ESC fecha
 *
 * Reusa o mesmo backend (/api/calendar/caldav) do MemberCalDAVSection.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  onConnected?: () => void;
}

const APP_PASSWORD_FORMAT = /^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$/i;

function isValidAppPassword(s: string): boolean {
  return APP_PASSWORD_FORMAT.test(s.trim());
}

function autoFormatPassword(s: string): string {
  // Aplica normalizeInput PRIMEIRO (remove invisíveis), depois filtro a-z.
  // Ordem inversa silenciosamente comeria chars válidos do clipboard.
  const cleaned = normalizeInput(s).toLowerCase().replace(/[^a-z]/g, '').slice(0, 16);
  return cleaned.replace(/(.{4})(?=.)/g, '$1-');
}

export function CalDAVConnectModal({ open, onClose, onConnected }: Props) {
  const [appleId, setAppleId] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const passwordInputRef = useRef<HTMLInputElement>(null);
  const autoConnectTriggeredRef = useRef(false);

  // Setup quando o modal abre (apenas pre-fill — NÃO abre Apple ID auto, pra
  // dar tempo do sócio ler as instruções primeiro)
  useEffect(() => {
    if (!open) {
      // Reset state quando fecha
      setAppPassword('');
      setError(null);
      setSuccess(null);
      autoConnectTriggeredRef.current = false;
      return;
    }
    // Pre-fill Apple ID com email do user
    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.email && !appleId) setAppleId(user.email);
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function openAppleIdTab() {
    window.open('https://account.apple.com/account/manage', '_blank', 'noopener');
    // Foca no campo de senha pra quando voltar do Apple já estar pronto
    setTimeout(() => passwordInputRef.current?.focus(), 300);
  }

  // Auto-paste do clipboard quando user volta pra essa aba
  useEffect(() => {
    if (!open) return;
    async function tryClipboardOnFocus() {
      if (appPassword) return;
      if (document.visibilityState !== 'visible') return;
      try {
        const perm = await navigator.permissions
          .query({ name: 'clipboard-read' as PermissionName })
          .catch(() => null);
        if (perm && perm.state === 'denied') return;
        const text = (await navigator.clipboard.readText()).trim();
        if (!text) return;
        const formatted = autoFormatPassword(text);
        if (isValidAppPassword(formatted)) {
          setAppPassword(formatted);
          toast.success('Senha colada — revise e clique em Conectar');
          // Auto-connect removido: clipboard pode ter dado corrompido + auto-
          // submit é dark pattern. User confirma visualmente e clica.
        }
      } catch {}
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
  }, [open, appPassword]);

  // ESC fecha
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  async function handleConnect() {
    setError(null);
    if (!appleId.trim() || !appPassword.trim()) {
      setError('Preencha Apple ID + app password');
      return;
    }
    if (!isValidAppPassword(appPassword.trim())) {
      setError('App password tem formato xxxx-xxxx-xxxx-xxxx (16 letras)');
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
      setSuccess(`Conectado a "${data.calendar?.name ?? 'seu calendar'}"`);
      toast.success('Apple Calendar conectado ✓');
      setTimeout(() => {
        onConnected?.();
        onClose();
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro de rede');
    } finally {
      setSubmitting(false);
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
        toast.warning('Colei mas não parece app-password Apple');
      }
    } catch {
      toast.error('Não consegui ler o clipboard. Cola manual com Ctrl+V.');
    }
  }

  const inputClass =
    'w-full px-3 py-2 bg-surface-base border border-surface-border rounded-lg text-text-primary text-sm placeholder:text-text-muted/60 focus:outline-none focus:border-accent transition-colors';
  const passwordValid = isValidAppPassword(appPassword);
  const passwordEmpty = appPassword.length === 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting) onClose();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Conectar Apple Calendar"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="bg-surface-elevated border border-surface-border rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-start gap-3 p-5 border-b border-surface-border">
              <div
                className="flex-shrink-0 w-10 h-10 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center"
                aria-hidden
              >
                <CalendarHeart className="w-5 h-5 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-text-primary text-lg font-semibold leading-tight">
                  Conectar Apple Calendar
                </h2>
                <p className="text-text-muted text-xs mt-1 leading-snug">
                  Receba reuniões direto no seu calendar, sem abrir email.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-shrink-0 text-text-muted hover:text-text-primary transition-colors p-1 disabled:opacity-50"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Success state */}
            {success ? (
              <div className="p-8 flex flex-col items-center text-center gap-3">
                <div className="w-16 h-16 rounded-full bg-success/15 border-2 border-success/30 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-success" />
                </div>
                <h3 className="text-text-primary text-lg font-semibold">{success}</h3>
                <p className="text-text-muted text-sm">
                  Suas próximas reuniões aparecem automaticamente.
                </p>
              </div>
            ) : (
              <div className="p-5 space-y-4">
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
                        <li>
                          Login com Apple ID + verificação em duas etapas
                        </li>
                        <li>
                          Menu lateral →{' '}
                          <strong className="text-text-secondary">Início de sessão e segurança</strong>
                        </li>
                        <li>
                          Clica em{' '}
                          <strong className="text-text-secondary">Senhas específicas de apps</strong>
                        </li>
                        <li>
                          <strong className="text-text-secondary">Gerar senha</strong> → dá um
                          nome (ex: <code className="text-accent">EQR Agenda</code>)
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

                {/* Passo 2: Form */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-accent font-bold text-xs"
                      style={{ color: '#0D1B2A' }}
                    >
                      2
                    </span>
                    <h3 className="text-sm font-medium text-text-primary">
                      Cola a senha aqui
                    </h3>
                  </div>

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
                          if (
                            e.key === 'Enter' &&
                            isValidAppPassword(appPassword) &&
                            appleId.trim()
                          ) {
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
                          : `Faltam ${
                              16 - appPassword.replace(/[^a-z]/gi, '').length
                            } letras`}
                      </p>
                    )}
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 px-2.5 py-1.5 rounded-md bg-danger/10 border border-danger/30 text-danger text-xs">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleConnect()}
                    disabled={submitting || !appleId.trim() || !passwordValid}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-accent text-brand font-medium text-sm hover:bg-accent-bright transition-colors disabled:opacity-50"
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
                </div>

                <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-surface-overlay/50 border border-surface-border">
                  <AlertCircle className="w-3 h-3 text-text-muted flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] text-text-muted leading-snug">
                    <strong className="text-text-secondary">
                      Sua senha do iCloud nunca é pedida.
                    </strong>{' '}
                    Só a app-password (que só acessa Calendar). Pra revogar, apaga no Apple
                    ID.
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
