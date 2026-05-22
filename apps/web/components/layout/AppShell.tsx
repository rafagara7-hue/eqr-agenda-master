'use client';

import { Sidebar } from './Sidebar';
import { CommandPalette } from './CommandPalette';
import { MemberProfilePanel } from './MemberProfilePanel';
import { PresenceProvider } from '@/contexts/PresenceContext';
import { AgendaSettingsProvider, useAgendaSettings } from '@/hooks/useAgendaSettings';

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { settings } = useAgendaSettings();
  const pos = settings.sidebarPosition;

  // Reserva espaço para a sidebar nas 4 posições, tanto mobile quanto desktop.
  // Mobile: rail vertical de 56px (left/right) ou barra de 56px (top/bottom).
  // Desktop: sidebar de 240px (left/right) ou barra de 56px (top/bottom).
  const mainClass =
    pos === 'left'
      ? 'ml-14 md:ml-[240px]'
      : pos === 'right'
      ? 'mr-14 md:mr-[240px]'
      : pos === 'top'
      ? 'pt-14'
      : 'pb-14';

  return (
    <div className="min-h-screen bg-surface-base flex flex-col">
      <Sidebar position={pos} />
      <main className={`flex-1 flex flex-col min-h-screen ${mainClass}`}>
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
