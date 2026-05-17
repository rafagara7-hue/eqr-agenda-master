'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { CalendarDays, AlertTriangle, RefreshCw, Users, ArrowRight, Circle, Clock } from 'lucide-react';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import { usePresenceContext } from '@/contexts/PresenceContext';

interface AdminOverviewProps {
  members: Array<{ id: string; name: string; slug: string; color_hex: string; avatar_url: string | null }>;
  events: Array<{ member_id: string; sync_status: string; status: string }>;
  conflicts: Array<{ member_id: string }>;
  failedSyncs: Array<{ status: string }>;
}

function StatCard({
  label, value, icon, color, onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
}) {
  return (
    <motion.div
      onClick={onClick}
      whileHover={onClick ? { y: -2 } : undefined}
      className={`bg-surface-elevated border border-surface-border rounded-xl p-4 transition-colors ${
        onClick ? 'cursor-pointer hover:border-surface-muted group' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-text-muted text-xs font-medium uppercase tracking-wider">{label}</p>
        <span style={{ color }} className="opacity-70">{icon}</span>
      </div>
      <div className="flex items-end justify-between mt-2">
        <p className="text-text-primary text-2xl font-semibold">{value}</p>
        {onClick && (
          <ArrowRight className="w-3.5 h-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity mb-1" />
        )}
      </div>
    </motion.div>
  );
}

export function AdminOverview({ members, events, conflicts, failedSyncs }: AdminOverviewProps) {
  const router = useRouter();
  const { onlineMemberIds } = usePresenceContext();
  const totalEvents = events.length;
  const totalConflicts = conflicts.length;
  const failedSyncCount = failedSyncs.filter((s) => s.status === 'failed').length;
  const tentativeCount = events.filter((e) => e.status === 'tentative').length;

  const activeMembers = members.filter((m) => m.slug !== 'admin');
  const onlineCount = activeMembers.filter((m) => onlineMemberIds.has(m.id)).length;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-text-primary text-xl font-semibold">Geral</h1>
        <p className="text-text-muted text-sm mt-1">Central de controle de todas as agendas EQR</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        <StatCard
          label="Total de eventos"
          value={totalEvents}
          icon={<CalendarDays className="w-4 h-4" />}
          color="#3B82F6"
          onClick={() => router.push('/calendar')}
        />
        <StatCard
          label="Membros online"
          value={onlineCount}
          icon={<Circle className="w-3.5 h-3.5 fill-current" />}
          color="#22C55E"
          onClick={() => router.push('/admin/members')}
        />
        <StatCard
          label="Provisórios"
          value={tentativeCount}
          icon={<Clock className="w-4 h-4" />}
          color="#F59E0B"
          onClick={() => router.push('/calendar?filter=tentative')}
        />
        <StatCard
          label="Horários cruzados"
          value={totalConflicts}
          icon={<AlertTriangle className="w-4 h-4" />}
          color="#F97316"
          onClick={() => router.push('/calendar?filter=conflicts')}
        />
        <StatCard
          label="Syncs com falha"
          value={failedSyncCount}
          icon={<RefreshCw className="w-4 h-4" />}
          color="#EF4444"
          onClick={() => router.push('/calendar?filter=failed-sync')}
        />
      </div>

      {/* Membros grid */}
      <div>
        <h2 className="text-text-secondary text-sm font-medium mb-3">Resumo por membro</h2>
        <div className="grid grid-cols-2 gap-4">
          {activeMembers.map((m, i) => {
            const memberEvents = events.filter((e) => e.member_id === m.id);
            const memberConflicts = conflicts.filter((c) => c.member_id === m.id);
            const syncedCount = memberEvents.filter((e) => e.sync_status === 'synced').length;

            return (
              <motion.button
                key={m.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                onClick={() => router.push(`/calendar?member=${m.id}`)}
                className="bg-surface-elevated border border-surface-border rounded-xl p-4 text-left group hover:border-surface-muted transition-colors cursor-pointer w-full"
                style={{ borderLeftColor: m.color_hex, borderLeftWidth: 3 }}
                whileHover={{ y: -2 }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <MemberAvatar
                    member={{ name: m.name, colorHex: m.color_hex, avatarUrl: m.avatar_url }}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-text-primary text-sm font-medium">{m.name}</p>
                    <p className="text-text-muted text-xs" style={{ color: m.color_hex }}>
                      Ver no calendário
                    </p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <p className="text-text-primary text-lg font-semibold">{memberEvents.length}</p>
                    <p className="text-text-muted text-[10px]">eventos</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold" style={{ color: memberConflicts.length > 0 ? '#F97316' : undefined }}>
                      {memberConflicts.length}
                    </p>
                    <p className="text-text-muted text-[10px]">cruzamentos</p>
                  </div>
                  <div className="text-center">
                    <p className="text-success text-lg font-semibold">{syncedCount}</p>
                    <p className="text-text-muted text-[10px]">sincronizados</p>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
