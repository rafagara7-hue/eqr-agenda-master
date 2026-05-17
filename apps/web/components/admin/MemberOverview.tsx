'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { CalendarDays, CheckCircle2, Clock, RefreshCw, ArrowRight, CalendarCheck } from 'lucide-react';
import { formatDate } from '@/lib/calendar/dateUtils';

interface MemberOverviewProps {
  member: {
    id: string;
    name: string;
    color_hex: string;
    avatar_url: string | null;
    role: string;
  };
  events: Array<{
    id: string;
    title: string;
    start_at: string;
    end_at: string;
    status: string;
    sync_status: string;
  }>;
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
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

export function MemberOverview({ member, events }: MemberOverviewProps) {
  const router = useRouter();

  const { totalEvents, confirmedCount, tentativeCount, todayCount, failedSyncCount, nextEvent } =
    useMemo(() => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

      return {
        totalEvents:      events.length,
        confirmedCount:   events.filter((e) => e.status === 'confirmed').length,
        tentativeCount:   events.filter((e) => e.status === 'tentative').length,
        todayCount:       events.filter((e) => {
          const s = new Date(e.start_at);
          return s >= todayStart && s < todayEnd;
        }).length,
        failedSyncCount:  events.filter((e) => e.sync_status === 'failed').length,
        nextEvent:        events.find((e) => new Date(e.start_at) >= now) ?? null,
      };
    }, [events]);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-text-primary text-xl font-semibold">Geral</h1>
        <p className="text-text-muted text-sm mt-1">Resumo da sua agenda</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Total de eventos"
          value={totalEvents}
          icon={<CalendarDays className="w-4 h-4" />}
          color="#3B82F6"
          onClick={() => router.push('/calendar')}
        />
        <StatCard
          label="Confirmados"
          value={confirmedCount}
          icon={<CheckCircle2 className="w-4 h-4" />}
          color="#22C55E"
        />
        <StatCard
          label="Provisórios"
          value={tentativeCount}
          icon={<Clock className="w-4 h-4" />}
          color="#F59E0B"
          onClick={tentativeCount > 0 ? () => router.push('/calendar?filter=tentative') : undefined}
        />
        <StatCard
          label="Eventos hoje"
          value={todayCount}
          icon={<CalendarCheck className="w-4 h-4" />}
          color="#8B5CF6"
        />
      </div>

      {/* Próximo evento */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="bg-surface-elevated border border-surface-border rounded-xl p-5"
      >
        <p className="text-text-muted text-xs font-medium uppercase tracking-wider mb-3">
          Próximo evento
        </p>

        {nextEvent ? (
          <div className="flex items-start gap-3">
            <div
              className="w-1 self-stretch rounded-full flex-shrink-0"
              style={{ backgroundColor: member.color_hex }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-text-primary text-sm font-semibold truncate">{nextEvent.title}</p>
              <p className="text-text-muted text-xs mt-0.5">
                {formatDate(new Date(nextEvent.start_at), "EEEE, d 'de' MMMM · HH:mm")}
              </p>
              <span
                className={`inline-block text-[10px] font-medium mt-2 px-2 py-0.5 rounded-full border ${
                  nextEvent.status === 'tentative'
                    ? 'bg-warning/10 text-warning border-warning/30'
                    : 'bg-success/10 text-success border-success/30'
                }`}
              >
                {nextEvent.status === 'tentative' ? 'Provisório' : 'Confirmado'}
              </span>
            </div>
            <button
              onClick={() => router.push('/calendar')}
              className="p-1.5 rounded-lg hover:bg-surface-overlay transition-colors text-text-muted hover:text-text-secondary flex-shrink-0 mt-0.5"
              title="Ver no calendário"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <p className="text-text-muted text-sm">Nenhum evento próximo agendado</p>
        )}
      </motion.div>

      {/* Syncs com falha — só aparece quando há falhas */}
      {failedSyncCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14 }}
          className="flex items-center justify-between gap-4 bg-danger/5 border border-danger/20 rounded-xl px-5 py-4"
        >
          <div className="flex items-center gap-3">
            <RefreshCw className="w-4 h-4 text-danger flex-shrink-0" />
            <div>
              <p className="text-text-primary text-sm font-medium">
                {failedSyncCount} {failedSyncCount === 1 ? 'evento com falha' : 'eventos com falha'} de sincronização
              </p>
              <p className="text-text-muted text-xs mt-0.5">
                Não sincronizados com o Google Calendar
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push('/calendar?filter=failed-sync')}
            className="flex items-center gap-1 text-danger text-xs font-medium hover:underline flex-shrink-0"
          >
            Ver <ArrowRight className="w-3 h-3" />
          </button>
        </motion.div>
      )}
    </div>
  );
}
