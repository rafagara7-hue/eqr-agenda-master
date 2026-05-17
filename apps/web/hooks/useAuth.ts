'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Member } from '@eqr/domain';

interface AuthState {
  user: User | null;
  member: Member | null;
  isLoading: boolean;
  isAdmin: boolean;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    member: null,
    isLoading: true,
    isAdmin: false,
  });
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    let mounted = true;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted) return;

      if (!user) {
        setState({ user: null, member: null, isLoading: false, isAdmin: false });
        return;
      }

      const { data: memberRow } = await supabase
        .from('members')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (!mounted) return;

      const member = memberRow
        ? ({
            id: memberRow.id,
            userId: memberRow.user_id,
            name: memberRow.name,
            slug: memberRow.slug,
            color: memberRow.color,
            colorHex: memberRow.color_hex,
            role: memberRow.role,
            isActive: memberRow.is_active,
            avatarUrl: memberRow.avatar_url,
            googleLinked: memberRow.google_linked,
            createdAt: new Date(memberRow.created_at),
            updatedAt: new Date(memberRow.updated_at),
          } satisfies Member)
        : null;

      setState({
        user,
        member,
        isLoading: false,
        isAdmin: member?.role === 'admin',
      });
    }

    void init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (!session) {
        setState({ user: null, member: null, isLoading: false, isAdmin: false });
      } else {
        void init();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  return state;
}

export function useSignOut() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  return async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };
}
