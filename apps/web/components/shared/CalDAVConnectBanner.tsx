'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarHeart, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

/**
 * Banner compacto no topo do /calendar quando sócio ainda não conectou CalDAV.
 * Click no botão → navega pra /admin/settings (onde tá a seção CalDAV otimizada).
 *
 * Hide automático se:
 *   - User não é member (admin não precisa)
 *   - CalDAV já conectado
 *   - Foi dispensado nas últimas 12h
 *
 * Substituiu o antigo banner de "Gerenciar URL" (Subscription URL iCal) que
 * apontava pro fluxo URL feed; CalDAV é mais smooth (push real-time).
 */

const DISMISS_KEY = 'eqr-caldav-banner-dismissed-until';
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

export function CalDAVConnectBanner() {
  const { member, isAdmin, isLoading } = useAuth();
  const router = useRouter();
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [caldavConnected, setCaldavConnected] = useState<boolean | null>(null);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  useEffect(() => {
    if (!member || isAdmin) {
      setCaldavConnected(true); // hide pra não-member ou admin
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/calendar/caldav');
        if (!res.ok) {
          if (!cancelled) setCaldavConnected(false);
          return;
        }
        const data = (await res.json()) as { connected?: boolean };
        if (!cancelled) setCaldavConnected(Boolean(data.connected));
      } catch {
        if (!cancelled) setCaldavConnected(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [member, isAdmin]);

  function handleDismiss() {
    const until = Date.now() + DISMISS_HOURS * 60 * 60 * 1000;
    try {
      localStorage.setItem(DISMISS_KEY, String(until));
    } catch {}
    setDismissed(true);
  }

  // Loading state: não mostra nada
  if (isLoading || dismissed === null || caldavConnected === null) return null;
  // Já conectou ou foi dispensado ou não é sócio
  if (caldavConnected || dismissed || !member || isAdmin) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="bg-surface-elevated border-b border-surface-border overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 py-3 max-w-7xl mx-auto">
          <div
            className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center"
            aria-hidden
          >
            <CalendarHeart className="w-4 h-4 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-text-primary text-sm font-medium leading-tight">
              Sincronize sua agenda com o Apple Calendar
            </p>
            <p className="text-text-muted text-xs mt-0.5 leading-snug truncate">
              Receba reuniões em segundos, sem abrir email.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/admin/settings#caldav')}
            className="flex-shrink-0 px-4 py-2 rounded-lg bg-accent text-brand font-medium text-sm hover:bg-accent-bright transition-colors"
            style={{ color: '#0D1B2A' }}
          >
            Conectar
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="flex-shrink-0 text-text-muted hover:text-text-primary transition-colors p-1"
            aria-label="Dispensar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
