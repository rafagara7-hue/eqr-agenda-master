'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarHeart, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { CalDAVConnectModal } from './CalDAVConnectModal';

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
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [caldavConnected, setCaldavConnected] = useState<boolean | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  async function reloadStatus() {
    if (!member || isAdmin) return;
    try {
      const res = await fetch('/api/calendar/caldav');
      if (!res.ok) return;
      const data = (await res.json()) as { connected?: boolean };
      setCaldavConnected(Boolean(data.connected));
    } catch {}
  }

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

  // Mostra banner se não conectou + não é admin + é member + não dispensou
  const showBanner =
    !isLoading &&
    dismissed === false &&
    caldavConnected === false &&
    Boolean(member) &&
    !isAdmin;

  return (
    <>
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="relative z-20 bg-surface-elevated border-b border-surface-border overflow-hidden shrink-0"
          >
            <div className="flex items-center gap-3 px-4 sm:px-6 py-5 max-w-7xl mx-auto">
              <div
                className="flex-shrink-0 w-10 h-10 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center"
                aria-hidden
              >
                <CalendarHeart className="w-5 h-5 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-text-primary text-base font-semibold leading-tight">
                  Sincronize sua agenda com o Apple Calendar
                </p>
                <p className="text-text-muted text-xs mt-1 leading-snug">
                  Receba reuniões em segundos, sem abrir email — funciona no Mac, iPhone e
                  iPad automaticamente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="flex-shrink-0 px-5 py-2.5 rounded-lg bg-accent text-brand font-semibold text-sm hover:bg-accent-bright transition-colors"
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
        )}
      </AnimatePresence>

      {/* Modal de conexão renderizado fora do conditional do banner pra que o
          exit animation funcione mesmo depois do banner sumir (auto-close) */}
      <CalDAVConnectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onConnected={() => void reloadStatus()}
      />
    </>
  );
}
