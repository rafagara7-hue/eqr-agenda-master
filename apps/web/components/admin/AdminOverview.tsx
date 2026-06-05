'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { CalendarDays, AlertTriangle, RefreshCw, ArrowRight, Circle, Clock, CheckCircle2, Users, History, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import { usePresenceContext } from '@/contexts/PresenceContext';
import { formatDate } from '@/lib/calendar/dateUtils';
import { useTranslation } from '@/lib/i18n';

interface AdminOverviewProps {
  members: Array<{ id: string; name: string; slug: string; color_hex: string; avatar_url: string | null }>;
  events: Array<{
    id: string;
    title: string;
    member_id: string;
    status: 'confirmed' | 'tentative' | 'cancelled';
    sync_status: string;
    sync_error: string | null;
    start_at: string;
    end_at: string;
  }>;
  conflicts: Array<{
    id: string;
    member_id: string;
    event_id_a: string;
    event_id_b: string;
  }>;
  failedSyncs: Array<{ status: string }>;
}

interface MemberLite {
  id: string;
  name: string;
  color_hex: string;
  avatar_url: string | null;
}

/**
 * Card unificado: cabeçalho (label + ícone + número grande) + conteúdo detalhado
 * dentro do mesmo retângulo. Substitui a separação StatCard / Section.
 */
function IndicatorCard({
  label,
  value,
  icon,
  color,
  cta,
  emptyText,
  children,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  cta?: { label: string; href: string };
  emptyText: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const clickable = !!cta;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden flex flex-col"
    >
      {/* Cabeçalho com indicador */}
      <button
        type="button"
        disabled={!clickable}
        onClick={() => cta && router.push(cta.href)}
        className={`text-left px-4 sm:px-5 lg:px-6 pt-4 sm:pt-5 lg:pt-6 pb-4 border-b border-surface-border ${
          clickable ? 'cursor-pointer hover:bg-surface-overlay/30 group transition-colors' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span style={{ color }} className="opacity-80 flex-shrink-0">{icon}</span>
              <p className="text-text-muted text-xs sm:text-sm font-medium uppercase tracking-wider truncate">{label}</p>
            </div>
            <p className="text-text-primary text-3xl sm:text-4xl lg:text-5xl font-semibold font-mono leading-none mt-3">{value}</p>
          </div>
          {clickable && (
            <ArrowRight className="w-4 h-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" />
          )}
        </div>
        {cta && (
          <p className="text-text-muted text-[11px] mt-2 sm:mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {cta.label} →
          </p>
        )}
      </button>

      {/* Conteúdo detalhado */}
      <div className="flex-1 p-4 sm:p-5 lg:p-6">
        {value === 0 ? (
          <p className="text-text-muted text-sm italic">{emptyText}</p>
        ) : (
          children
        )}
      </div>
    </motion.div>
  );
}

function EventRow({
  event,
  member,
  onClick,
  rightSlot,
}: {
  event: { title: string; start_at: string };
  member: MemberLite | undefined;
  onClick?: () => void;
  rightSlot?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-2 -mx-2 py-2 rounded-lg hover:bg-surface-overlay/60 transition-colors text-left group"
    >
      <div
        className="w-1 self-stretch rounded-full flex-shrink-0"
        style={{ backgroundColor: member?.color_hex ?? '#6B7280' }}
      />
      {member && (
        <MemberAvatar
          member={{ name: member.name, colorHex: member.color_hex, avatarUrl: member.avatar_url }}
          size="xs"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-text-primary text-sm font-medium truncate">{event.title}</p>
        <p className="text-text-muted text-[11px] font-mono">
          {member ? `${member.name} · ` : ''}
          {formatDate(new Date(event.start_at), "dd/MM · HH:mm")}
        </p>
      </div>
      {rightSlot}
      <ArrowRight className="w-3.5 h-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </button>
  );
}

export function AdminOverview({ members, events, conflicts, failedSyncs }: AdminOverviewProps) {
  const router = useRouter();
  const { onlineMemberIds } = usePresenceContext();
  const { t } = useTranslation();
  const [deletingPast, setDeletingPast] = useState(false);

  const nowMs = Date.now();
  const totalEvents = events.length;
  const totalConflicts = conflicts.length;
  const failedSyncCount = failedSyncs.filter((s) => s.status === 'failed').length;
  const tentativeCount = events.filter((e) => e.status === 'tentative').length;
  const confirmedCount = events.filter((e) => e.status === 'confirmed').length;
  const pastCount = events.filter((e) => new Date(e.end_at).getTime() < nowMs).length;

  const activeMembers = members.filter((m) => m.slug !== 'admin' && m.slug !== 'external');
  const onlineMembers = activeMembers.filter((m) => onlineMemberIds.has(m.id));
  const offlineMembers = activeMembers.filter((m) => !onlineMemberIds.has(m.id));
  const onlineCount = onlineMembers.length;

  const memberById = useMemo(() => {
    const m = new Map<string, MemberLite>();
    members.forEach((member) => m.set(member.id, member));
    return m;
  }, [members]);

  const eventById = useMemo(() => {
    const m = new Map<string, AdminOverviewProps['events'][number]>();
    events.forEach((e) => m.set(e.id, e));
    return m;
  }, [events]);

  const upcomingEvents = useMemo(() => events.slice(0, 8), [events]);
  const confirmedEvents = useMemo(() => events.filter((e) => e.status === 'confirmed').slice(0, 8), [events]);
  const tentativeEvents = useMemo(() => events.filter((e) => e.status === 'tentative').slice(0, 8), [events]);
  const failedEvents = useMemo(() => events.filter((e) => e.sync_status === 'failed').slice(0, 8), [events]);
  const pastEvents = useMemo(
    () =>
      events
        .filter((e) => new Date(e.end_at).getTime() < nowMs)
        .sort((a, b) => new Date(b.end_at).getTime() - new Date(a.end_at).getTime())
        .slice(0, 8),
    [events, nowMs]
  );

  async function handleDeletePast() {
    if (pastCount === 0) return;
    const ok = window.confirm(t('admin.deletePast.confirm'));
    if (!ok) return;
    setDeletingPast(true);
    try {
      const res = await fetch('/api/events/delete-past', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; deleted?: number; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? t('admin.deletePast.error'));
      toast.success(`${data.deleted ?? 0} ${t('admin.deletePast.success')}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('admin.deletePast.error'));
    } finally {
      setDeletingPast(false);
    }
  }

  const conflictRows = useMemo(() => {
    const seen = new Set<string>();
    return conflicts
      .map((c) => {
        const key = [c.event_id_a, c.event_id_b].sort().join('|');
        if (seen.has(key)) return null;
        seen.add(key);
        const evA = eventById.get(c.event_id_a);
        const evB = eventById.get(c.event_id_b);
        return { id: c.id, member_id: c.member_id, evA, evB };
      })
      .filter((x): x is { id: string; member_id: string; evA: typeof events[number] | undefined; evB: typeof events[number] | undefined } => x !== null)
      .slice(0, 8);
  }, [conflicts, eventById]);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-text-primary text-xl font-semibold">{t('admin.overview.title')}</h1>
        <p className="text-text-muted text-sm mt-1">{t('admin.overview.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4 sm:gap-5">
        {/* Total */}
        <IndicatorCard
          label={t('admin.indicator.total')}
          value={totalEvents}
          icon={<CalendarDays className="w-4 h-4" />}
          color="#3B82F6"
          cta={{ label: t('admin.cta.viewEvents'), href: '/calendar' }}
          emptyText={t('admin.empty.events')}
        >
          <ul className="space-y-0.5">
            {upcomingEvents.map((e) => (
              <li key={e.id}>
                <EventRow
                  event={e}
                  member={memberById.get(e.member_id)}
                  onClick={() => router.push('/calendar')}
                />
              </li>
            ))}
            {totalEvents > upcomingEvents.length && (
              <li className="text-text-muted text-xs italic px-2 pt-2">
                + {totalEvents - upcomingEvents.length} {t('admin.indicator.inCalendar')}
              </li>
            )}
          </ul>
        </IndicatorCard>

        {/* Online */}
        <IndicatorCard
          label={t('admin.indicator.online')}
          value={onlineCount}
          icon={<Circle className="w-3.5 h-3.5 fill-current" />}
          color="#22C55E"
          cta={{ label: t('admin.cta.viewMemberProfiles'), href: '/admin/members' }}
          emptyText={t('admin.empty.online')}
        >
          <div className="space-y-1.5">
            {onlineMembers.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => router.push(`/admin/members/${m.id}`)}
                className="w-full flex items-center gap-2.5 px-2 -mx-2 py-1.5 rounded-lg hover:bg-surface-overlay/60 transition-colors text-left group"
              >
                <span className="w-2 h-2 rounded-full bg-success flex-shrink-0" />
                <MemberAvatar
                  member={{ name: m.name, colorHex: m.color_hex, avatarUrl: m.avatar_url }}
                  size="xs"
                />
                <span className="text-text-primary text-sm flex-1">{m.name}</span>
                <ArrowRight className="w-3.5 h-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
            {offlineMembers.length > 0 && (
              <p className="text-text-muted text-[11px] mt-2 pt-2 border-t border-surface-border">
                {t('admin.indicator.offline')} {offlineMembers.map((m) => m.name).join(' · ')}
              </p>
            )}
          </div>
        </IndicatorCard>

        {/* Confirmados */}
        <IndicatorCard
          label={t('admin.indicator.confirmed')}
          value={confirmedCount}
          icon={<CheckCircle2 className="w-4 h-4" />}
          color="#22C55E"
          cta={{ label: t('admin.cta.viewConfirmed'), href: '/calendar?filter=confirmed' }}
          emptyText={t('admin.empty.confirmed')}
        >
          <ul className="space-y-0.5">
            {confirmedEvents.map((e) => (
              <li key={e.id}>
                <EventRow
                  event={e}
                  member={memberById.get(e.member_id)}
                  onClick={() => router.push('/calendar?filter=confirmed')}
                />
              </li>
            ))}
            {confirmedCount > confirmedEvents.length && (
              <li className="text-text-muted text-xs italic px-2 pt-2">
                + {confirmedCount - confirmedEvents.length} {t('admin.indicator.inCalendar')}
              </li>
            )}
          </ul>
        </IndicatorCard>

        {/* Provisórios */}
        <IndicatorCard
          label={t('admin.indicator.tentative')}
          value={tentativeCount}
          icon={<Clock className="w-4 h-4" />}
          color="#F59E0B"
          cta={{ label: t('admin.cta.viewTentative'), href: '/calendar?filter=tentative' }}
          emptyText={t('admin.empty.tentative')}
        >
          <ul className="space-y-0.5">
            {tentativeEvents.map((e) => (
              <li key={e.id}>
                <EventRow
                  event={e}
                  member={memberById.get(e.member_id)}
                  onClick={() => router.push('/calendar?filter=tentative')}
                  rightSlot={
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-warning/40 text-warning bg-warning/10">
                      {t('event.status.tentative')}
                    </span>
                  }
                />
              </li>
            ))}
            {tentativeCount > tentativeEvents.length && (
              <li className="text-text-muted text-xs italic px-2 pt-2">
                + {tentativeCount - tentativeEvents.length} {t('admin.indicator.inCalendar')}
              </li>
            )}
          </ul>
        </IndicatorCard>

        {/* Passados */}
        <IndicatorCard
          label={t('admin.indicator.past')}
          value={pastCount}
          icon={<History className="w-4 h-4" />}
          color="#8C8C8C"
          cta={pastCount > 0 ? { label: t('admin.cta.viewPast'), href: '/calendar' } : undefined}
          emptyText={t('admin.empty.past')}
        >
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => void handleDeletePast()}
              disabled={deletingPast || pastCount === 0}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-danger/40 text-danger hover:bg-danger/10 transition-colors text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px]"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deletingPast ? t('common.deleting') : t('admin.deletePast.button')}
            </button>
            <ul className="space-y-0.5">
              {pastEvents.map((e) => (
                <li key={e.id}>
                  <EventRow
                    event={e}
                    member={memberById.get(e.member_id)}
                    onClick={() => router.push('/calendar')}
                    rightSlot={
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-text-muted/40 text-text-muted bg-surface-overlay">
                        {t('admin.indicator.past')}
                      </span>
                    }
                  />
                </li>
              ))}
              {pastCount > pastEvents.length && (
                <li className="text-text-muted text-xs italic px-2 pt-2">
                  + {pastCount - pastEvents.length} {t('admin.indicator.older')}
                </li>
              )}
            </ul>
          </div>
        </IndicatorCard>

        {/* Cruzados */}
        <IndicatorCard
          label={t('admin.indicator.conflicts')}
          value={totalConflicts}
          icon={<AlertTriangle className="w-4 h-4" />}
          color="#F97316"
          cta={{ label: t('admin.cta.viewConflicts'), href: '/calendar?filter=conflicts' }}
          emptyText={t('admin.empty.conflicts')}
        >
          <ul className="space-y-2">
            {conflictRows.map((c) => {
              const member = memberById.get(c.member_id);
              return (
                <li
                  key={c.id}
                  className="flex items-start gap-3 px-2 -mx-2 py-2 rounded-lg hover:bg-surface-overlay/60 transition-colors"
                >
                  <Users className="w-3.5 h-3.5 text-warning mt-1 flex-shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1">
                    {c.evA && (
                      <p className="text-text-primary text-sm truncate">
                        <span className="font-medium">{c.evA.title}</span>
                        <span className="text-text-muted text-[11px] font-mono ml-1.5">
                          · {formatDate(new Date(c.evA.start_at), "dd/MM HH:mm")}
                        </span>
                      </p>
                    )}
                    {c.evB && (
                      <p className="text-text-primary text-sm truncate">
                        <span className="font-medium">{c.evB.title}</span>
                        <span className="text-text-muted text-[11px] font-mono ml-1.5">
                          · {formatDate(new Date(c.evB.start_at), "dd/MM HH:mm")}
                        </span>
                      </p>
                    )}
                    {member && (
                      <p className="text-text-muted text-[11px]">
                        {t('common.member')}: <span className="text-text-secondary">{member.name}</span>
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
            {totalConflicts > conflictRows.length && (
              <li className="text-text-muted text-xs italic px-2 pt-2">
                + {totalConflicts - conflictRows.length} {t('admin.indicator.inCalendar')}
              </li>
            )}
          </ul>
        </IndicatorCard>

        {/* Syncs com falha */}
        <IndicatorCard
          label={t('admin.indicator.failedSync')}
          value={failedSyncCount}
          icon={<RefreshCw className="w-4 h-4" />}
          color="#EF4444"
          cta={failedSyncCount > 0 ? { label: t('admin.cta.viewFailedSync'), href: '/calendar?filter=failed-sync' } : undefined}
          emptyText={t('admin.empty.failedSync')}
        >
          <ul className="space-y-0.5">
            {failedEvents.map((e) => (
              <li key={e.id}>
                <EventRow
                  event={e}
                  member={memberById.get(e.member_id)}
                  onClick={() => router.push('/calendar?filter=failed-sync')}
                  rightSlot={
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-danger/40 text-danger bg-danger/10 max-w-[140px] truncate"
                      title={e.sync_error ?? t('event.calendarSyncFailed')}
                    >
                      {e.sync_error ? e.sync_error.split(':').pop()?.trim() ?? 'falha' : 'falha'}
                    </span>
                  }
                />
              </li>
            ))}
            {failedEvents.length === 0 && (
              <li className="text-text-muted text-sm italic">{t('admin.empty.failedSync')}</li>
            )}
          </ul>
        </IndicatorCard>
      </div>
    </div>
  );
}
