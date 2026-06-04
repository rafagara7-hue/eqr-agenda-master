'use client';

import type React from 'react';
import { EqrLogo } from '@/components/shared/EqrLogo';

/**
 * Shell minimal para rotas publicas (ex.: /agendar).
 * Sem auth, sem sidebar. So logo + container centralizado.
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-base flex flex-col">
      {/* Header simples */}
      <header className="bg-surface-elevated border-b border-surface-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-2.5">
          <EqrLogo blend className="w-8 h-8 rounded-full ring-2 ring-accent flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-text-primary text-sm font-semibold leading-none truncate">
              EQR Agenda
            </p>
            <p className="text-text-muted text-[10px] mt-0.5 uppercase tracking-wider">
              Solicitar reunião
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">{children}</main>

      <footer className="border-t border-surface-border py-3">
        <p className="text-center text-text-muted text-[11px]">
          EQR Holding · Agenda
        </p>
      </footer>
    </div>
  );
}
