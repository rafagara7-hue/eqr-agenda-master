'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, User, Link2, Link2Off, Phone } from 'lucide-react';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { usePresenceContext } from '@/contexts/PresenceContext';
import { formatPhone } from '@/lib/phone';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';

function PanelContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const profileId = searchParams.get('profile');
  const supabase = getSupabaseBrowserClient();
  const { onlineMemberIds } = usePresenceContext();
  const { isAdmin, member: currentMember } = useAuth();
  const { t } = useTranslation();

  const { data: member } = useQuery({
    queryKey: ['member-panel', profileId],
    queryFn: async () => {
      const { data } = await supabase.from('members').select('*').eq('id', profileId!).single();
      return data;
    },
    enabled: !!profileId,
    staleTime: 60_000,
  });

  function close() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('profile');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  useEffect(() => {
    if (!profileId) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, pathname]);

  const isOnline = member ? onlineMemberIds.has(member.id) : false;

  return (
    <AnimatePresence>
      {profileId && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={close}
            className="fixed inset-0 z-30 bg-black/30"
          />

          {/* Painel */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full sm:w-80 bg-surface-elevated border-l border-surface-border z-40 flex flex-col shadow-modal"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border shrink-0">
              <p className="text-text-primary text-sm font-semibold">{t('profilePanel.title')}</p>
              <button
                onClick={close}
                className="p-1.5 rounded-md hover:bg-surface-overlay transition-colors"
              >
                <X className="w-4 h-4 text-text-muted" />
              </button>
            </div>

            {member ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Card de identidade */}
                <div
                  className="flex items-center gap-4 p-4 bg-surface-overlay rounded-xl border border-surface-border"
                  style={{ borderTopColor: member.color_hex, borderTopWidth: 3 }}
                >
                  <div className="relative flex-shrink-0">
                    <MemberAvatar
                      member={{ name: member.name, colorHex: member.color_hex, avatarUrl: member.avatar_url }}
                      size="lg"
                      className="w-12 h-12 text-lg"
                    />
                    <span
                      className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-surface-overlay ${
                        isOnline ? 'bg-success' : 'bg-surface-muted'
                      }`}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-text-primary font-semibold truncate">{member.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {member.role === 'admin' ? (
                        <>
                          <Shield className="w-3 h-3 text-member-blue flex-shrink-0" />
                          <span className="text-member-blue text-xs">{t('common.administrator')}</span>
                        </>
                      ) : (
                        <>
                          <User className="w-3 h-3 text-text-muted flex-shrink-0" />
                          <span className="text-text-muted text-xs">{t('common.member')}</span>
                        </>
                      )}
                      <span className={`text-xs ${isOnline ? 'text-success' : 'text-text-muted'}`}>
                        · {isOnline ? t('common.online') : t('common.offline')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Detalhes */}
                <div className="space-y-0 rounded-xl border border-surface-border overflow-hidden">
                  <div className="flex justify-between items-center text-sm px-4 py-3 border-b border-surface-border">
                    <span className="text-text-muted">{t('profilePanel.color')}</span>
                    <span
                      className="w-4 h-4 rounded-full border border-surface-border"
                      style={{ backgroundColor: member.color_hex }}
                      aria-label={t('profilePanel.color')}
                    />
                  </div>
                  {member.phone && (
                    <a
                      href={`tel:+${member.phone}`}
                      className="flex justify-between items-center text-sm px-4 py-3 border-b border-surface-border hover:bg-surface-elevated transition-colors"
                    >
                      <span className="text-text-muted flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5" /> {t('members.phone')}
                      </span>
                      <span className="text-text-secondary text-xs">{formatPhone(member.phone)}</span>
                    </a>
                  )}
                  <div className="flex justify-between items-center text-sm px-4 py-3">
                    <span className="text-text-muted">{t('profilePanel.outlookCalendar')}</span>
                    <span className={`flex items-center gap-1 text-xs font-medium ${member.calendar_linked ? 'text-success' : 'text-text-muted'}`}>
                      {member.calendar_linked
                        ? <><Link2 className="w-3.5 h-3.5" /> {t('common.linked')}</>
                        : <><Link2Off className="w-3.5 h-3.5" /> {t('common.notLinked')}</>
                      }
                    </span>
                  </div>
                </div>

                {/* Ações */}
                <button
                  onClick={() => router.push(`/calendar?member=${member.id}`)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-surface-overlay border border-surface-border rounded-xl text-sm text-text-secondary hover:border-surface-muted hover:text-text-primary transition-all group"
                >
                  <span>{t('profilePanel.viewEvents')}</span>
                  <span className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                </button>

                {(isAdmin || currentMember?.id === member.id) && (
                  <button
                    onClick={() => { close(); router.push(`/admin/members/${member.id}`); }}
                    className="w-full flex items-center justify-between px-4 py-3 bg-surface-overlay border border-surface-border rounded-xl text-sm text-text-secondary hover:border-surface-muted hover:text-text-primary transition-all group"
                  >
                    <span>{t('profilePanel.viewFullProfile')}</span>
                    <span className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-surface-muted border-t-member-blue rounded-full animate-spin" />
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

export function MemberProfilePanel() {
  return (
    <Suspense>
      <PanelContent />
    </Suspense>
  );
}
