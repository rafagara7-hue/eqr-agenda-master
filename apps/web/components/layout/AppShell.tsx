'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { BrandBackground } from './BrandBackground';
import { CommandPalette } from './CommandPalette';
import { MemberProfilePanel } from './MemberProfilePanel';
import { PresenceProvider } from '@/contexts/PresenceContext';
import { AgendaSettingsProvider, useAgendaSettings } from '@/hooks/useAgendaSettings';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const EDGE_HIT_AREA = 24;     // px da borda em que o swipe é "ativado"
const OPEN_THRESHOLD = 50;    // px que o dedo precisa percorrer pra abrir

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { settings } = useAgendaSettings();
  const { t } = useTranslation();
  const pos = settings.sidebarPosition;
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Aplica tema de layout (EQR / Original / Pro) no body
  useEffect(() => {
    document.body.classList.remove('theme-original', 'theme-pro');
    if (settings.layoutTheme === 'original') document.body.classList.add('theme-original');
    if (settings.layoutTheme === 'pro') document.body.classList.add('theme-pro');
  }, [settings.layoutTheme]);

  // Fecha ao navegar
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Bloqueia scroll do body enquanto aberta
  useEffect(() => {
    if (!sidebarOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [sidebarOpen]);

  const isVertical = pos === 'left' || pos === 'right';

  // Gesto: arrastar da borda da tela pra abrir (mobile e desktop touch)
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!isVertical || sidebarOpen) return;

    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      if (!t) return;
      const w = window.innerWidth;
      if (pos === 'left' && t.clientX <= EDGE_HIT_AREA) {
        touchStart.current = { x: t.clientX, y: t.clientY };
      } else if (pos === 'right' && t.clientX >= w - EDGE_HIT_AREA) {
        touchStart.current = { x: t.clientX, y: t.clientY };
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (!touchStart.current) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - touchStart.current.x;
      const dy = t.clientY - touchStart.current.y;
      // Se movimento for predominantemente vertical, cancela (usuário está rolando a página)
      if (Math.abs(dy) > Math.abs(dx)) {
        touchStart.current = null;
        return;
      }
      if (pos === 'left' && dx > OPEN_THRESHOLD) {
        setSidebarOpen(true);
        touchStart.current = null;
      } else if (pos === 'right' && dx < -OPEN_THRESHOLD) {
        setSidebarOpen(true);
        touchStart.current = null;
      }
    }

    function onTouchEnd() {
      touchStart.current = null;
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [pos, sidebarOpen, isVertical]);

  // Vertical: overlay flutuante, não reserva espaço.
  // Top: barra grande (68px). Bottom: barra compacta (56px).
  const mainClass = isVertical
    ? ''
    : pos === 'top'
    ? 'pt-[68px]'
    : 'pb-14';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Background decorativo da marca EQR — só no tema EQR; body já provê o bg-surface-base */}
      {settings.layoutTheme === 'eqr' && <BrandBackground />}

      <Sidebar
        position={pos}
        isOpen={isVertical ? sidebarOpen : true}
        onClose={() => setSidebarOpen(false)}
      />

      {isVertical && (
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30"
              aria-hidden="true"
            />
          )}
        </AnimatePresence>
      )}

      {/* Alça dourada na borda — dica visual mobile pra arrastar */}
      {isVertical && !sidebarOpen && (
        <div
          className={cn(
            'md:hidden fixed top-1/2 -translate-y-1/2 z-30 w-1 h-14 rounded-full bg-accent/70 shadow-md pointer-events-none',
            pos === 'left' ? 'left-0.5' : 'right-0.5'
          )}
          aria-hidden="true"
        />
      )}

      {/* Hamburger — só desktop (mouse) */}
      {isVertical && !sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label={t('nav.openMenu')}
          className={cn(
            'hidden md:flex fixed top-2.5 z-30 p-2 rounded-lg bg-surface-elevated/95 border border-surface-border shadow-md backdrop-blur',
            'text-text-secondary hover:text-text-primary hover:bg-surface-overlay transition-colors',
            pos === 'left' ? 'left-2.5' : 'right-2.5'
          )}
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      <main className={`relative z-10 flex-1 flex flex-col min-h-screen ${mainClass}`}>
        {children}
      </main>
      <CommandPalette />
      <MemberProfilePanel />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AgendaSettingsProvider>
      <PresenceProvider>
        <AppShellInner>{children}</AppShellInner>
      </PresenceProvider>
    </AgendaSettingsProvider>
  );
}
