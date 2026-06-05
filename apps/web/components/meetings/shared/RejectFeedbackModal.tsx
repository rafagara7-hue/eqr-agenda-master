'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface RejectFeedbackModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  meetingTitle?: string;
}

const MODAL_TITLE_ID = 'reject-modal-title';
const MODAL_DESC_ID = 'reject-modal-desc';

/**
 * Modal "Recusar reunião com feedback" — abre ao clicar Recusar.
 *
 * Features:
 * - Textarea opcional para feedback (motivo da recusa)
 * - Botões Cancelar + Confirmar (com loading)
 * - ESC para fechar + click fora para fechar
 * - Mobile-friendly (min-h-[44px] tap targets)
 * - Animações framer-motion
 * - Backdrop escuro com blur
 * - Foco inicial + restauração ao fechar
 */
export function RejectFeedbackModal({
  open,
  onClose,
  onConfirm,
  meetingTitle,
}: RejectFeedbackModalProps) {
  const [mounted, setMounted] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Foco inicial ao abrir + restauração ao fechar + ESC
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    setTimeout(() => textareaRef.current?.focus(), 50);

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
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
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function handleConfirm() {
    if (inFlightRef.current || loading) return;
    inFlightRef.current = true;
    setLoading(true);
    try {
      await onConfirm(reason.trim());
      setReason('');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao recusar');
    } finally {
      inFlightRef.current = false;
      setLoading(false);
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
          className="w-full max-w-md bg-surface-elevated border border-surface-border rounded-2xl shadow-modal overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
            <div>
              <h2 id={MODAL_TITLE_ID} className="text-text-primary text-lg font-semibold">
                Recusar reunião
              </h2>
              <p id={MODAL_DESC_ID} className="text-text-muted text-xs mt-0.5">
                {meetingTitle ? `"${meetingTitle}"` : 'Forneça um motivo (opcional)'}
              </p>
            </div>
            <button
              ref={closeBtnRef}
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-surface-overlay transition-colors disabled:opacity-50"
              aria-label="Fechar"
              disabled={loading}
            >
              <X className="w-4 h-4 text-text-muted" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            <div>
              <label htmlFor="reject-reason" className="block text-text-secondary text-xs font-medium mb-2 uppercase tracking-wider">
                Motivo da recusa
              </label>
              <textarea
                ref={textareaRef}
                id="reject-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Por que está recusando? (opcional)"
                maxLength={2000}
                rows={4}
                disabled={loading}
                className="w-full px-3 py-2.5 bg-surface-base border border-surface-border rounded-lg text-text-primary text-sm placeholder:text-text-muted/60 focus:outline-none focus:border-accent transition-colors resize-y disabled:opacity-50"
              />
              <p className="text-text-muted text-[11px] mt-1.5">
                {reason.length}/2000 caracteres
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-surface-border flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="text-xs font-medium px-4 py-2.5 rounded-lg border border-surface-border text-text-secondary hover:bg-surface-overlay transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={loading}
              className="text-xs font-medium px-4 py-2.5 rounded-lg bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] inline-flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Recusando…
                </>
              ) : (
                'Confirmar recusa'
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(modal, document.body);
}