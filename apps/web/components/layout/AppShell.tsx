'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { BrandBackground } from './BrandBackground';
import { CommandPalette } from './CommandPalette';
import { MemberProfilePanel } from './MemberProfilePanel';
import { NotificationBell } from './NotificationBell';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import { GoogleConnectBanner } from '@/components/shared/GoogleConnectBanner';
import { PresenceProvider } from '@/contexts/PresenceContext';
import { AgendaSettingsProvider, useAgendaSettings } from '@/hooks/useAgendaSettings';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const EDGE_HIT_AREA = 24;     // px da borda em que o swipe é "ativado"
const OPEN_THRESHOLD = 50;    // px que o dedo precisa percorrer pra abrir

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { settings } = useAgendaSettings();
  const pos = settings.sidebarPosition;
  const pathname = usePathname();
  const { member, isAdmin } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const profileGlow = isAdmin ? '#C9A85C' : (member?.colorHex ?? '#6B7280');

  // Aplica tema de layout (EQR vs Original) no body
  useEffect(() => {
    if (settings.layoutTheme === 'original') {
      document.body.classList.add('theme-original');
    } else {
      document.body.classList.remove('theme-original');
    }
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
          aria-label="Abrir menu"
          className={cn(
            'hidden md:flex fixed top-2.5 z-30 p-2 rounded-lg bg-surface-elevated/95 border border-surface-border shadow-md backdrop-blur',
            'text-text-secondary hover:text-text-primary hover:bg-surface-overlay transition-colors',
            pos === 'left' ? 'left-2.5' : 'right-2.5'
          )}
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      {/* Cluster de perfil + notificações — canto oposto ao hambúrguer.
          Garante que o avatar fique sempre visível mesmo com a sidebar escondida. */}
      {isVertical && member && (
        <div
          className={cn(
            'fixed top-2 z-30 flex items-center gap-1.5',
            pos === 'left' ? 'right-2.5' : 'left-2.5'
          )}
        >
          <div className="rounded-lg bg-surface-elevated/95 border border-surface-border shadow-md backdrop-blur">
            <NotificationBell />
          </div>
          <Link
            href={{ pathname, query: { profile: member.id } }}
            title="Meu perfil"
            aria-label="Meu perfil"
            className="rounded-full bg-surface-elevated/95 border border-surface-border shadow-md backdrop-blur p-0.5 flex items-center justify-center transition-transform hover:scale-105"
            style={{ boxShadow: `0 0 0 2px ${profileGlow}` }}
          >
            <MemberAvatar member={member} size="sm" />
          </Link>
        </div>
      )}

      <main className={`relative z-10 flex-1 flex flex-col min-h-screen ${mainClass}`}>
        <GoogleConnectBanner />
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
