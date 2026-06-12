'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Botão "Sincronizar" dedicado, visível em mobile e desktop.
 * Dispara POST /api/calendar/caldav-sync-now que bypassa o throttle 60s.
 *
 * - User normal: sincroniza só a própria conta CalDAV
 * - Admin: sincroniza todas em paralelo
 *
 * Mostra toast com resumo: "Apple Calendar: 2 novo(s), 1 removido(s)".
 */
export function CalDAVSyncNowButton({ className = '' }: { className?: string }) {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/calendar/caldav-sync-now', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        pull?: { inserted?: number; updated?: number; deleted?: number };
        delete?: { deleted?: number };
      };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Erro ao sincronizar');
        return;
      }
      const ins = data.pull?.inserted ?? 0;
      const upd = data.pull?.updated ?? 0;
      const del = (data.pull?.deleted ?? 0) + (data.delete?.deleted ?? 0);
      const total = ins + upd + del;
      if (total === 0) {
        toast.success('Tudo sincronizado');
      } else {
        const parts: string[] = [];
        if (ins) parts.push(`${ins} novo${ins > 1 ? 's' : ''}`);
        if (upd) parts.push(`${upd} atualizado${upd > 1 ? 's' : ''}`);
        if (del) parts.push(`${del} removido${del > 1 ? 's' : ''}`);
        toast.success(`Apple Calendar: ${parts.join(', ')}`);
      }
      void queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro de rede');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={loading}
      aria-label="Sincronizar com Apple Calendar"
      title="Sincronizar com Apple Calendar agora"
      className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 hover:text-accent-bright transition-all disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[36px] ${className}`}
    >
      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
      <span>{loading ? 'Sincronizando…' : 'Sincronizar Apple'}</span>
    </button>
  );
}
