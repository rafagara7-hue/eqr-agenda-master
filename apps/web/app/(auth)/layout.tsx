'use client';

import { AgendaSettingsProvider } from '@/hooks/useAgendaSettings';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AgendaSettingsProvider>{children}</AgendaSettingsProvider>;
}
