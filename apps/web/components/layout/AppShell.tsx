'use client';

import { Sidebar } from './Sidebar';
import { CommandPalette } from './CommandPalette';
import { MemberProfilePanel } from './MemberProfilePanel';
import { PresenceProvider } from '@/contexts/PresenceContext';
import { AgendaSettingsProvider, useAgendaSettings } from '@/hooks/useAgendaSettings';

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { settings } = useAgendaSettings();
  const pos = settings.sidebarPosition;

  // On mobile, always reserve space for the bottom nav (left/right become bottom on mobile)
  const mainClass =
    pos === 'left' ? 'pb-14 md:pb-0 md:ml-[240px]' :
    pos === 'right' ? 'pb-14 md:pb-0 md:mr-[240px]' :
    pos === 'top' ? 'pt-14' :
    'pb-14';

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
