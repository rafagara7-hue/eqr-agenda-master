'use client';

import type React from 'react';
import { LogOut } from 'lucide-react';
import { motion } from 'framer-motion';
import { EqrLogo } from '@/components/shared/EqrLogo';
import { useAuth, useSignOut } from '@/hooks/useAuth';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import { cn } from '@/lib/utils';

interface StaffShellProps {
  children: React.ReactNode;
}

/**
 * Shell minimalista pro subsistema do funcionario.
 * Sem sidebar dos socios, sem quick-access. So logo + nome do user + sair.
 * Tematica EQR mantida.
 */
export function StaffShell({ children }: StaffShellProps) {
  const { member } = useAuth();
  const signOut = useSignOut();

  return (
    <div className="min-h-screen bg-surface-base flex flex-col">
      {/* Header minimal */}
      <header
        className={cn(
          'sticky top-0 z-20 bg-surface-elevated/95 backdrop-blur-sm',
          'border-b border-surface-border'
        )}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2.5 min-w-0">
            <EqrLogo blend className="w-8 h-8 rounded-full ring-2 ring-accent flex-shrink-0" />
            <div className="min-w-0 hidden sm:block">
              <p className="text-text-primary text-sm font-semibold leading-none truncate">
                EQR Agenda
              </p>
              <p className="text-text-muted text-[10px] mt-0.5 uppercase tracking-wider">
                Funcionário
              </p>
            </div>
          </div>

          {/* User + logout */}
          {member && (
            <div className="ml-auto flex items-center gap-2.5">
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-surface-overlay/60 transition-colors">
                <MemberAvatar member={member} size="sm" />
                <span className="text-text-primary text-xs font-medium hidden sm:block max-w-[120px] truncate">
                  {member.name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="p-2 rounded-md hover:bg-surface-overlay transition-colors"
                title="Sair"
                aria-label="Sair"
              >
                <LogOut className="w-4 h-4 text-text-muted" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Conteudo principal */}
      <motion.main
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="flex-1 flex flex-col"
      >
        {children}
      </motion.main>

      {/* Footer minimal */}
      <footer className="border-t border-surface-border py-3">
        <p className="text-center text-text-muted text-[11px]">
          EQR Holding · Agenda
        </p>
      </footer>
    </div>
  );
}
