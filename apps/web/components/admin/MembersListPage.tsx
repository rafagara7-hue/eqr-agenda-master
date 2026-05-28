'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Shield, User, ChevronRight, Link2Off, Link2, Phone } from 'lucide-react';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import { usePresenceContext } from '@/contexts/PresenceContext';
import { formatPhone } from '@/lib/phone';
import { useTranslation } from '@/lib/i18n';

interface MemberRow {
  id: string;
  name: string;
  slug: string;
  color_hex: string;
  avatar_url: string | null;
  role: string;
  is_active: boolean;
  google_linked: boolean;
  phone: string | null;
}

interface MembersListPageProps {
  members: MemberRow[];
  /** Eventos de TODOS membros (apenas admin recebe não-vazio). Usado pros contadores nos cards. */
  events?: Array<{ member_id: string; sync_status: string; status: string }>;
  /** Conflitos não resolvidos. */
  conflicts?: Array<{ member_id: string }>;
  currentMemberId: string;
  isAdmin: boolean;
}

export function MembersListPage({ members, events = [], conflicts = [], currentMemberId, isAdmin }: MembersListPageProps) {
  const router = useRouter();
  const { onlineMemberIds } = usePresenceContext();
  const { t } = useTranslation();

  const active = members.filter((m) => m.slug !== 'admin');
  const adminMember = members.find((m) => m.slug === 'admin');

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-text-primary text-xl font-semibold">{t('members.title')}</h1>
        <p className="text-text-muted text-sm mt-1">
          {isAdmin ? t('members.subtitleAdmin') : t('members.subtitleSelf')}
        </p>
      </div>

      {/* Grid de membros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {active.map((m, i) => {
          const isOwn = m.id === currentMemberId;
          const canClick = isAdmin || isOwn;
          const isOnline = onlineMemberIds.has(m.id);

          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              onClick={() => canClick && router.push(`/admin/members/${m.id}`)}
              className={`relative bg-surface-elevated border border-surface-border rounded-xl p-3 sm:p-5 transition-all group
                ${canClick ? 'cursor-pointer hover:border-surface-muted hover:shadow-card-hover' : 'opacity-70'}`}
              style={{ borderLeftColor: m.color_hex, borderLeftWidth: 3 }}
            >
              {/* Badge próprio */}
              {isOwn && (
                <span className="absolute top-3 right-3 text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-muted text-text-muted">
                  {t('members.you')}
                </span>
              )}

              <div className="flex items-center gap-4 mb-4">
                <div className="relative flex-shrink-0">
                  <MemberAvatar
                    member={{ name: m.name, colorHex: m.color_hex, avatarUrl: m.avatar_url }}
                    size="lg"
                  />
                  <span
                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-surface-elevated ${
                      isOnline ? 'bg-success' : 'bg-surface-muted'
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-text-primary font-semibold text-base truncate">{m.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <User className="w-3 h-3 text-text-muted" />
                    <span className="text-text-muted text-xs capitalize">{m.role === 'admin' ? t('role.admin') : t('role.member')}</span>
                    <span className={`text-[10px] font-medium ${isOnline ? 'text-success' : 'text-text-muted'}`}>
                      · {isOnline ? t('common.online') : t('common.offline')}
                    </span>
                  </div>
                </div>
                {canClick && (
                  <ChevronRight className="w-4 h-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-3">
                {m.phone && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-text-muted">
                    <Phone className="w-3 h-3" />
                    {formatPhone(m.phone)}
                  </span>
                )}
                <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${m.google_linked ? 'text-success' : 'text-text-muted'}`}>
                  {m.google_linked ? <Link2 className="w-3 h-3" /> : <Link2Off className="w-3 h-3" />}
                  {m.google_linked ? t('members.googleLinked') : t('members.googleNotLinked')}
                </span>
              </div>

              {/* Indicadores (admin only) — desktop em 3 colunas, mobile em lista vertical */}
              {isAdmin && (() => {
                const memberEvents = events.filter((e) => e.member_id === m.id);
                const memberConflicts = conflicts.filter((c) => c.member_id === m.id);
                const syncedCount = memberEvents.filter((e) => e.sync_status === 'synced').length;
                return (
                  <div className="pt-3 border-t border-surface-border">
                    <div className="hidden sm:grid grid-cols-3 gap-2">
                      <div className="text-center">
                        <p className="text-text-primary text-lg font-semibold">{memberEvents.length}</p>
                        <p className="text-text-muted text-[10px]">{t('members.statsEvents')}</p>
                      </div>
                      <div className="text-center">
                        <p
                          className="text-lg font-semibold"
                          style={{ color: memberConflicts.length > 0 ? '#F97316' : undefined }}
                        >
                          {memberConflicts.length}
                        </p>
                        <p className="text-text-muted text-[10px]">{t('members.statsCrossings')}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-success text-lg font-semibold">{syncedCount}</p>
                        <p className="text-text-muted text-[10px]">{t('members.statsSynced')}</p>
                      </div>
                    </div>
                    <ul className="sm:hidden space-y-1.5">
                      <li className="flex items-center justify-between text-sm">
                        <span className="text-text-muted">{t('members.statsEventsLabel')}</span>
                        <span className="text-text-primary font-semibold">{memberEvents.length}</span>
                      </li>
                      <li className="flex items-center justify-between text-sm">
                        <span className="text-text-muted">{t('members.statsCrossingsLabel')}</span>
                        <span
                          className="font-semibold"
                          style={{ color: memberConflicts.length > 0 ? '#F97316' : undefined }}
                        >
                          {memberConflicts.length}
                        </span>
                      </li>
                      <li className="flex items-center justify-between text-sm">
                        <span className="text-text-muted">{t('members.statsSyncedLabel')}</span>
                        <span className="text-success font-semibold">{syncedCount}</span>
                      </li>
                    </ul>
                  </div>
                );
              })()}
            </motion.div>
          );
        })}
      </div>

      {/* Admin separado */}
      {isAdmin && adminMember && (
        <div>
          <h2 className="text-text-secondary text-sm font-medium mb-3">{t('members.adminSection')}</h2>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => router.push(`/admin/members/${adminMember.id}`)}
            className="flex items-center gap-4 bg-surface-elevated border border-surface-border rounded-xl p-4 cursor-pointer hover:border-surface-muted transition-all group max-w-sm"
          >
            <MemberAvatar
              member={{ name: adminMember.name, colorHex: adminMember.color_hex, avatarUrl: adminMember.avatar_url }}
              size="md"
            />
            <div className="flex-1 min-w-0">
              <p className="text-text-primary font-medium text-sm">{adminMember.name}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <Shield className="w-3 h-3 text-member-blue" />
                <span className="text-member-blue text-xs">{t('members.adminBadge')}</span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
          </motion.div>
        </div>
      )}
    </div>
  );
}
