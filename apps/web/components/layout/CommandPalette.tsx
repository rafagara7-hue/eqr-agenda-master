'use client';

import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Command } from 'cmdk';
import { CalendarDays, Plus, Search, SkipForward } from 'lucide-react';
import { useCommandPalette } from '@/hooks/useCommandPalette';

export function CommandPalette() {
  const { open, setOpen, search, setSearch } = useCommandPalette();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setOpen((v) => !v);
    }
  }, [setOpen]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-lg bg-surface-overlay border border-surface-border rounded-xl shadow-modal overflow-hidden"
          >
            <Command className="bg-transparent" shouldFilter={true}>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border">
                <Search className="w-4 h-4 text-text-muted flex-shrink-0" />
                <Command.Input
                  value={search}
                  onValueChange={setSearch}
                  placeholder="Buscar ou criar..."
                  className="flex-1 bg-transparent text-text-primary text-sm placeholder-text-muted outline-none"
                  autoFocus
                />
                <kbd className="text-text-muted text-[10px] bg-surface-elevated border border-surface-border rounded px-1.5 py-0.5">
                  ESC
                </kbd>
              </div>

              <Command.List className="max-h-72 overflow-y-auto py-2">
                <Command.Empty className="py-6 text-center text-text-muted text-sm">
                  Nenhum resultado encontrado.
                </Command.Empty>

                <Command.Group heading="Ações rápidas" className="px-2">
                  <CommandItem
                    icon={<Plus className="w-3.5 h-3.5" />}
                    label="Criar novo evento"
                    shortcut="N"
                    onSelect={() => setOpen(false)}
                  />
                  <CommandItem
                    icon={<CalendarDays className="w-3.5 h-3.5" />}
                    label="Ir para hoje"
                    shortcut="T"
                    onSelect={() => setOpen(false)}
                  />
                  <CommandItem
                    icon={<SkipForward className="w-3.5 h-3.5" />}
                    label="Ver próxima semana"
                    onSelect={() => setOpen(false)}
                  />
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function CommandItem({
  icon,
  label,
  shortcut,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-text-secondary text-sm cursor-pointer
                 hover:text-text-primary hover:bg-surface-elevated transition-colors
                 data-[selected=true]:text-text-primary data-[selected=true]:bg-surface-elevated"
    >
      <span className="text-text-muted">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && (
        <kbd className="text-text-muted text-[10px] bg-surface-overlay border border-surface-border rounded px-1.5 py-0.5">
          {shortcut}
        </kbd>
      )}
    </Command.Item>
  );
}
