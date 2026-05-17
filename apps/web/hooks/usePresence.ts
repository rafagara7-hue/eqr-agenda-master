'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { useAuth } from './useAuth';

export function usePresence() {
  const { member } = useAuth();
  const supabase = getSupabaseBrowserClient();
  const [onlineMemberIds, setOnlineMemberIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!member) return;

    const channel = supabase.channel('presence:eqr-agenda', {
      config: { presence: { key: member.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ memberId: string }>();
        const ids = new Set(
          Object.values(state).flat().map((p) => p.memberId)
        );
        setOnlineMemberIds(ids);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ memberId: member.id });
        }
      });

    return () => {
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id]);

  return { onlineMemberIds };
}
