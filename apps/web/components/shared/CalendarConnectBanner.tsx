'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link2, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import { ConnectOutlookModal } from './ConnectOutlookModal';

/**
 * Banner persistente no topo do conteúdo quando o member ainda não conectou
 * o Outlook Calendar. Botão abre wizard de 2 passos pra conectar via URL iCal.
 * Pode ser dispensado por sessão (não some pra sempre).
 *
 * NOTA: useAuth não usa react-query (mantém state local). Pra refletir o
 * member.calendarLinked após conectar, chamamos auth.refetch() E também
 * setamos dismissed=true otimisticamente pra esconder o banner imediatamente.
 */

const DISMISS_KEY = 'eqr-calendar-connect-dismissed-until';
const DISMISS_HOURS = 12;

function readDismissed(): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    const until = localStorage.getItem(DISMISS_KEY);
    if (!until) return false;
    const ts = Number(until);
    if (Number.isNaN(ts)) {
      localStorage.removeItem(DISMISS_KEY);
      return false;
    }
    if (ts <= Date.now()) {
      localStorage.removeItem(DISMISS_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function CalendarConnectBanner() {
  const { member, isLoading, refetch } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // null = ainda nao decidiu (server render); false = ativo; true = dispensado
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  function handleDismiss() {
    const until = Date.now() + DISMISS_HOURS * 60 * 60 * 1000;
    try { localStorage.setItem(DISMISS_KEY, String(until)); } catch {}
    setDismissed(true);
  }

  async function handleConnected() {
    // Esconde otimisticamente — useAuth.refetch + invalidate covers o resto
    setDismissed(true);
    void refetch();
    void queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
    void queryClient.invalidateQueries({ queryKey: ['sidebar-members'] });
    void queryClient.invalidateQueries({ queryKey: ['members-list'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-calendar-linked-members'] });
  }

  const shouldShowBanner =
    !isLoading && !!member && !member.calendarLinked && dismissed === false;

  return (
    <>
      <AnimatePresence>
        {shouldShowBanner && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="relative z-20 border-b border-accent/40 sm:border-accent/30 bg-accent/15 sm:bg-accent/5"
          >
            <div className="px-3 sm:px-4 py-2.5 flex items-center gap-3">
              <span className="inline-flex w-7 h-7 rounded-full bg-accent/15 items-center justify-center flex-shrink-0">
                <Link2 className="w-3.5 h-3.5 text-accent" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-text-primary text-xs sm:text-sm font-medium leading-tight">
                  {t('banner.connectCalendar.title')}
                </p>
                <p className="text-text-muted text-[11px] sm:text-xs leading-tight mt-0.5 hidden sm:block">
                  {t('banner.connectCalendar.body')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="text-xs font-medium px-3 py-1.5 rounded-md bg-accent text-brand hover:bg-accent-bright transition-colors whitespace-nowrap min-h-[36px] flex items-center"
                style={{ color: '#0D1B2A' }}
              >
                {t('banner.connectCalendar.cta')}
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                aria-label={t('banner.connectCalendar.dismiss')}
                className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors flex-shrink-0"
                title={t('banner.connectCalendar.dismissHint')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal sempre montado (controlado por open) pra evitar perda de state ao reabrir.
          Nao renderiza nada quando !open. */}
      {!isLoading && !!member && !member.calendarLinked && (
        <ConnectOutlookModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onConnected={() => void handleConnected()}
        />
      )}
    </>
  );
}
