'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /**
   * Limita altura máxima — 'auto' deixa o conteúdo definir (até 80vh).
   * Default 'auto'.
   */
  maxHeight?: 'auto' | 'full';
}

export function BottomSheet({ open, onClose, title, children, maxHeight = 'auto' }: BottomSheetProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const sheet = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-[1000] bg-black/40"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 360 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
            className={cn(
              'fixed left-0 right-0 bottom-0 z-[1001]',
              'bg-surface-elevated border-t border-surface-border rounded-t-2xl shadow-modal',
              'flex flex-col',
              maxHeight === 'full' ? 'h-[85vh]' : 'max-h-[80vh]'
            )}
          >
            <div className="flex flex-col items-center pt-2 pb-1 shrink-0">
              <span className="w-10 h-1 rounded-full bg-surface-muted" aria-hidden />
            </div>
            <div className="flex items-center justify-between px-5 pt-2 pb-3 shrink-0">
              {title ? (
                <h2 className="text-text-primary text-sm font-semibold">{title}</h2>
              ) : <span />}
              <button
                type="button"
                onClick={onClose}
                className="p-2 -mr-2 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (!mounted) return null;
  return createPortal(sheet, document.body);
}
