'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link2, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';

/**
 * Banner persistente no topo do conteúdo quando o member ainda não conectou
 * o Microsoft Outlook Calendar. Botão único leva direto ao OAuth. Pode ser
 * dispensado por sessão (não some pra sempre).
 */

const DISMISS_KEY = 'eqr-calendar-connect-dismissed-until';
const DISMISS_HOURS = 12;

export function CalendarConnectBanner() {
  const { member, isLoading } = useAuth();
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      const until = localStorage.getItem(DISMISS_KEY);
      if (until && Number(until) > Date.now()) setDismissed(true);
      else setDismissed(false);
    } catch {
      setDismissed(false);
    }
  }, []);

  if (isLoading || !member) return null;
  if (member.calendarLinked) return null;
  if (dismissed) return null;

  function handleDismiss() {
    const until = Date.now() + DISMISS_HOURS * 60 * 60 * 1000;
    try { localStorage.setItem(DISMISS_KEY, String(until)); } catch {}
    setDismissed(true);
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        className="border-b border-accent/30 bg-accent/5"
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
          <a
            href="/api/microsoft/connect"
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-accent text-brand hover:bg-accent-bright transition-colors whitespace-nowrap min-h-[36px] flex items-center"
            style={{ color: '#0D1B2A' }}
          >
            {t('banner.connectCalendar.cta')}
          </a>
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
    </AnimatePresence>
  );
}
