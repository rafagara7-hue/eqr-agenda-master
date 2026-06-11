'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Banner persistente no topo do conteúdo quando o member ainda não configurou
 * sua URL de compartilhamento da agenda. Botão leva pro perfil do member onde
 * a Subscription URL (.ics) pode ser gerada/copiada/revogada.
 *
 * Pode ser dispensado por sessão (volta em 12h).
 *
 * Histórico: até 2026-06-08 esse banner abria um modal pro fluxo iCal antigo
 * (publicar calendar no Outlook + colar URL). Removido porque exigia Outlook
 * com Exchange, que nenhum sócio EQR tem. Hoje aponta pra Subscription URL
 * universal — funciona em Google/Apple/Outlook/qualquer calendar app.
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
  const { member, isLoading } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  // null = ainda nao decidiu (server render); false = ativo; true = dispensado
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  // Trigger novo: CalDAV (Apple Calendar) é o caminho oficial. Banner só
  // aparece pra quem AINDA não tem CalDAV. calendar_linked (Outlook OAuth) está
  // parqueado e ficaria sempre false, fazendo o banner aparecer pra todos.
  const [hasCaldav, setHasCaldav] = useState<boolean | null>(null);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  useEffect(() => {
    if (!member) return;
    const supabase = getSupabaseBrowserClient();
    void (async () => {
      const { data } = await supabase
        .from('caldav_connections')
        .select('verified_at')
        .eq('member_id', member.id)
        .maybeSingle();
      const row = data as { verified_at: string | null } | null;
      setHasCaldav(!!row?.verified_at);
    })();
  }, [member]);

  function handleDismiss() {
    const until = Date.now() + DISMISS_HOURS * 60 * 60 * 1000;
    try { localStorage.setItem(DISMISS_KEY, String(until)); } catch {}
    setDismissed(true);
  }

  function handleOpenShareSetup() {
    if (!member) return;
    router.push(`/admin/members/${member.id}`);
  }

  // Mostra se: terminou load, há member, AINDA não temos resposta de CalDAV
  // mas a query terminou e member NÃO tem CalDAV verificado, e o banner não
  // foi dispensado nesta janela.
  const shouldShowBanner =
    !isLoading
    && !!member
    && hasCaldav === false
    && dismissed === false;

  return (
    <AnimatePresence>
      {shouldShowBanner && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="border-b border-accent/40 sm:border-accent/30 bg-accent/15 sm:bg-accent/5"
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
              onClick={handleOpenShareSetup}
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
  );
}
