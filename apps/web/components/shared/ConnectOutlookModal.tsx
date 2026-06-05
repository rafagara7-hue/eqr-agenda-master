'use client';

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, ClipboardPaste, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';

interface ConnectOutlookModalProps {
  open: boolean;
  onClose: () => void;
  onConnected: () => void;
}

const OUTLOOK_CORP_URL =
  'https://outlook.office.com/calendar/options/calendar/sharedCalendars';
const OUTLOOK_PERSONAL_URL =
  'https://outlook.live.com/owa/?path=/options/calendar/publishedCalendarSettings';

const MODAL_TITLE_ID = 'outlook-modal-title';
const MODAL_DESC_ID = 'outlook-modal-desc';

/**
 * Wizard "Conectar Outlook" — 2 passos lado a lado:
 *   1. Abrir Outlook nas configurações de publicação
 *   2. Colar URL iCal copiada
 *
 * Acessibilidade: role="dialog", aria-modal, aria-labelledby/describedby,
 * foco inicial no botão close, restauração de foco ao fechar.
 *
 * Privacidade: clipboard só é lido via clique explícito no botão "Colar do
 * clipboard". Sem leitura automática no onFocus (LGPD/GDPR).
 */
export function ConnectOutlookModal({ open, onClose, onConnected }: ConnectOutlookModalProps) {
  const { t } = useTranslation();
  const [accountType, setAccountType] = useState<'corp' | 'personal'>('corp');
  const [icalUrl, setIcalUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  // Guard sincrono pra evitar double-click race
  const inFlightRef = useRef(false);

  useEffect(() => { setMounted(true); }, []);

  // Foco inicial ao abrir + restauração ao fechar + ESC
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    setTimeout(() => closeBtnRef.current?.focus(), 50);

    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      // Restaura foco ao elemento que disparou abertura
      previouslyFocusedRef.current?.focus();
    };
  }, [open, onClose]);

  // Body scroll lock quando aberto
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Clipboard só via clique EXPLÍCITO no botão (consentimento claro)
  async function pasteFromClipboard() {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
        toast.error('Navegador não suporta clipboard automático');
        return;
      }
      const text = await navigator.clipboard.readText();
      if (text && /outlook\.(live|office|office365)\.com\/.*calendar\.ics/i.test(text.trim())) {
        setIcalUrl(text.trim());
        toast.success('URL detectada do clipboard');
      } else if (text) {
        toast.error('URL no clipboard não é do Outlook');
      }
    } catch {
      toast.error('Permissão de clipboard negada');
    }
  }

  function handleOpenOutlook() {
    const url = accountType === 'corp' ? OUTLOOK_CORP_URL : OUTLOOK_PERSONAL_URL;
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => inputRef.current?.focus(), 200);
  }

  async function handleConnect() {
    // Guard sincrono — evita double-click race antes do isSubmitting state propagar
    if (inFlightRef.current) return;
    setError(null);
    const trimmed = icalUrl.trim();
    if (!trimmed) {
      setError('Cole a URL iCal do Outlook');
      return;
    }
    inFlightRef.current = true;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/microsoft/connect-ical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icalUrl: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        eventsFound?: number;
        synced?: number;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Erro ao conectar');
        return;
      }
      toast.success(`Outlook conectado — ${data.synced ?? 0} eventos sincronizados`);
      onConnected();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro de rede');
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  }

  if (!open || !mounted) return null;

  const modal = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={MODAL_TITLE_ID}
          aria-describedby={MODAL_DESC_ID}
          className="w-full max-w-3xl bg-surface-elevated border border-surface-border rounded-2xl shadow-modal overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
            <div>
              <h2 id={MODAL_TITLE_ID} className="text-text-primary text-lg font-semibold">
                Conectar Outlook Calendar
              </h2>
              <p id={MODAL_DESC_ID} className="text-text-muted text-xs mt-0.5">
                Visualização somente leitura — eventos do Outlook aparecem na agenda EQR
              </p>
            </div>
            <button
              ref={closeBtnRef}
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-surface-overlay transition-colors"
              aria-label="Fechar"
            >
              <X className="w-4 h-4 text-text-muted" />
            </button>
          </div>

          {/* Conteúdo: 2 passos lado a lado */}
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Passo 1 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex w-6 h-6 rounded-full bg-accent/15 items-center justify-center text-accent text-xs font-bold">
                  1
                </span>
                <h3 className="text-text-primary font-medium">Publique seu calendar no Outlook</h3>
              </div>

              <p className="text-text-muted text-xs">
                Abrirei o Outlook nas configurações de publicação. Lá você clica em{' '}
                <strong>Publicar calendário</strong>, escolhe a permissão{' '}
                <strong>"Disponibilidade, assunto e localização"</strong>, clica{' '}
                <strong>Publicar</strong> e copia o link iCal gerado.
              </p>

              {/* Account type toggle */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAccountType('corp')}
                  className={`flex-1 text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${
                    accountType === 'corp'
                      ? 'bg-accent/15 border-accent/40 text-accent'
                      : 'bg-surface-overlay border-surface-border text-text-muted hover:text-text-primary'
                  }`}
                >
                  Outlook 365 (empresa)
                </button>
                <button
                  type="button"
                  onClick={() => setAccountType('personal')}
                  className={`flex-1 text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${
                    accountType === 'personal'
                      ? 'bg-accent/15 border-accent/40 text-accent'
                      : 'bg-surface-overlay border-surface-border text-text-muted hover:text-text-primary'
                  }`}
                >
                  Outlook.com (pessoal)
                </button>
              </div>

              <button
                type="button"
                onClick={() => void handleOpenOutlook()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-brand font-medium text-sm hover:bg-accent-bright transition-colors min-h-[44px]"
                style={{ color: '#0D1B2A' }}
              >
                <ExternalLink className="w-4 h-4" />
                Abrir Outlook
              </button>

              <details className="text-xs text-text-muted">
                <summary className="cursor-pointer hover:text-text-secondary">
                  Não consigo achar a opção
                </summary>
                <ol className="mt-2 space-y-1 list-decimal list-inside pl-2">
                  <li>Outlook Web → ⚙ Configurações</li>
                  <li>Calendário → Calendários compartilhados</li>
                  <li>"Publicar um calendário"</li>
                  <li>Selecione "Calendário" + permissão</li>
                  <li>Publicar → copie o link iCal</li>
                </ol>
              </details>
            </div>

            {/* Passo 2 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex w-6 h-6 rounded-full bg-accent/15 items-center justify-center text-accent text-xs font-bold">
                  2
                </span>
                <h3 className="text-text-primary font-medium">Cole a URL aqui</h3>
              </div>

              <p className="text-text-muted text-xs">
                Depois de publicar, o Outlook mostra o link iCal. Cole aqui:
              </p>

              <div className="space-y-2">
                <input
                  ref={inputRef}
                  type="url"
                  value={icalUrl}
                  onChange={(e) => { setIcalUrl(e.target.value); setError(null); }}
                  placeholder="https://outlook.office365.com/.../calendar.ics"
                  aria-label="URL iCal do Outlook"
                  className="w-full px-3 py-2.5 bg-surface-base border border-surface-border rounded-lg text-text-primary text-sm placeholder:text-text-muted/60 focus:outline-none focus:border-accent transition-colors font-mono text-xs"
                  disabled={isSubmitting}
                />

                <button
                  type="button"
                  onClick={() => void pasteFromClipboard()}
                  className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
                >
                  <ClipboardPaste className="w-3 h-3" />
                  Colar do clipboard
                </button>
              </div>

              {error && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleConnect()}
                disabled={isSubmitting || !icalUrl.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-success text-white font-medium text-sm hover:bg-success/90 transition-colors min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Conectando…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Conectar
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Footer info */}
          <div className="px-6 py-3 bg-surface-overlay/50 border-t border-surface-border">
            <p className="text-text-muted text-xs">
              <strong>Limites:</strong> sincronização atualiza a cada 30 min, é
              somente leitura (eventos criados no EQR Agenda não vão pro Outlook).
              Sync completo bidirecional estará disponível em breve.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(modal, document.body);
}
