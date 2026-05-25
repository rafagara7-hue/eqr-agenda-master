'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { CalendarDays, AlertTriangle, RefreshCw, ArrowRight, Circle, Clock, CheckCircle2, Users } from 'lucide-react';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import { usePresenceContext } from '@/contexts/PresenceContext';
import { formatDate } from '@/lib/calendar/dateUtils';

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
      className={`bg-surface-elevated border border-surface-border rounded-xl p-4 sm:p-5 lg:p-6 transition-colors ${
        onClick ? 'cursor-pointer hover:border-surface-muted group' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-text-muted text-xs sm:text-sm font-medium uppercase tracking-wider">{label}</p>
        <span style={{ color }} className="opacity-70 sm:scale-125 lg:scale-150 flex-shrink-0">{icon}</span>
      </div>
      <div className="flex items-end justify-between mt-2 sm:mt-4">
        <p className="text-text-primary text-2xl sm:text-3xl lg:text-4xl font-semibold font-mono leading-none">{value}</p>
        {onClick && (
          <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity mb-1" />
        )}
      </div>
    </motion.div>
  );
}

interface MemberLite {
  id: string;
  name: string;
  color_hex: string;
  avatar_url: string | null;
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  iconColor: string;
  count: number;
  emptyText: string;
  cta?: { label: string; href: string };
  children?: React.ReactNode;
}

function Section({ title, icon, iconColor, count, emptyText, cta, children }: SectionProps) {
  const router = useRouter();
  return (
    <div className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-surface-border">
        <div className="flex items-center gap-2">
          <span style={{ color: iconColor }} className="opacity-80">{icon}</span>
          <h2 className="text-text-secondary text-sm font-medium uppercase tracking-wider">{title}</h2>
          <span className="text-text-muted text-xs font-mono">({count})</span>
        </div>
        {cta && (
          <button
            type="button"
            onClick={() => router.push(cta.href)}
            className="text-text-muted hover:text-text-primary text-xs font-medium inline-flex items-center gap-1 group"
          >
            {cta.label}
            <ArrowRight className="w-3 h-3 opacity-60 group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}
      </div>
      <div className="p-4 sm:p-5">
        {count === 0 ? (
          <p className="text-text-muted text-sm italic">{emptyText}</p>
        ) : (
          children
        )}
      </div>
    </div>
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

  const totalEvents = events.length;
  const totalConflicts = conflicts.length;
  const failedSyncCount = failedSyncs.filter((s) => s.status === 'failed').length;
  const tentativeCount = events.filter((e) => e.status === 'tentative').length;
  const confirmedCount = events.filter((e) => e.status === 'confirmed').length;

  const activeMembers = members.filter((m) => m.slug !== 'admin');
  const onlineMembers = activeMembers.filter((m) => onlineMemberIds.has(m.id));
  const offlineMembers = activeMembers.filter((m) => !onlineMemberIds.has(m.id));
  const onlineCount = onlineMembers.length;

  // Map id → member para lookup rápido
  const memberById = useMemo(() => {
    const m = new Map<string, MemberLite>();
    members.forEach((member) => m.set(member.id, member));
    return m;
  }, [members]);

  // Map id → event para lookup nos conflitos
  const eventById = useMemo(() => {
    const m = new Map<string, AdminOverviewProps['events'][number]>();
    events.forEach((e) => m.set(e.id, e));
    return m;
  }, [events]);

  const confirmedEvents = useMemo(
    () => events.filter((e) => e.status === 'confirmed').slice(0, 8),
    [events]
  );
  const tentativeEvents = useMemo(
    () => events.filter((e) => e.status === 'tentative').slice(0, 8),
    [events]
  );
  const failedEvents = useMemo(
    () => events.filter((e) => e.sync_status === 'failed').slice(0, 8),
    [events]
  );

  // Conflitos: deduplica por par (event_id_a, event_id_b) e enriquece com event + member
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
      {/* Header */}
      <div>
        <h1 className="text-text-primary text-xl font-semibold">Geral</h1>
        <p className="text-text-muted text-sm mt-1">Central de controle de todas as agendas EQR</p>
      </div>

      {/* Stats — cada card é o link de cabeçalho do indicador correspondente abaixo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3 sm:gap-5">
        <StatCard label="Total de eventos" value={totalEvents} icon={<CalendarDays className="w-4 h-4" />} color="#3B82F6" onClick={() => router.push('/calendar')} />
        <StatCard label="Membros online" value={onlineCount} icon={<Circle className="w-3.5 h-3.5 fill-current" />} color="#22C55E" onClick={() => router.push('/admin/members')} />
        <StatCard label="Confirmados" value={confirmedCount} icon={<CheckCircle2 className="w-4 h-4" />} color="#22C55E" onClick={() => router.push('/calendar?filter=confirmed')} />
        <StatCard label="Provisórios" value={tentativeCount} icon={<Clock className="w-4 h-4" />} color="#F59E0B" onClick={() => router.push('/calendar?filter=tentative')} />
        <StatCard label="Eventos cruzados" value={totalConflicts} icon={<AlertTriangle className="w-4 h-4" />} color="#F97316" onClick={() => router.push('/calendar?filter=conflicts')} />
        <StatCard label="Syncs com falha" value={failedSyncCount} icon={<RefreshCw className="w-4 h-4" />} color="#EF4444" onClick={() => router.push('/calendar?filter=failed-sync')} />
      </div>

      {/* Detalhes — grid responsivo de seções */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {/* 1. Total de eventos — CTA */}
        <Section
          title="Total de eventos"
          icon={<CalendarDays className="w-4 h-4" />}
          iconColor="#3B82F6"
          count={totalEvents}
          emptyText="Nenhum evento cadastrado ainda."
          cta={{ label: 'Ver todos no calendário', href: '/calendar' }}
        >
          <p className="text-text-secondary text-sm">
            {totalEvents === 1 ? '1 evento' : `${totalEvents} eventos`} na base.
            Clique em <span className="text-text-primary">"Ver todos no calendário"</span> pra navegar.
          </p>
        </Section>

        {/* 2. Membros online */}
        <Section
          title="Membros online"
          icon={<Circle className="w-3.5 h-3.5 fill-current" />}
          iconColor="#22C55E"
          count={onlineCount}
          emptyText="Nenhum membro online no momento."
          cta={{ label: 'Ver perfis', href: '/admin/members' }}
        >
          <div className="space-y-1.5">
            {onlineMembers.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-success flex-shrink-0" />
                <MemberAvatar
                  member={{ name: m.name, colorHex: m.color_hex, avatarUrl: m.avatar_url }}
                  size="xs"
                />
                <span className="text-text-primary text-sm">{m.name}</span>
              </div>
            ))}
            {offlineMembers.length > 0 && (
              <p className="text-text-muted text-[11px] mt-2 pt-2 border-t border-surface-border">
                Offline: {offlineMembers.map((m) => m.name).join(' · ')}
              </p>
            )}
          </div>
        </Section>

        {/* 3. Confirmados */}
        <Section
          title="Confirmados"
          icon={<CheckCircle2 className="w-4 h-4" />}
          iconColor="#22C55E"
          count={confirmedCount}
          emptyText="Nenhum evento confirmado."
          cta={{ label: 'Ver no calendário', href: '/calendar?filter=confirmed' }}
        >
          <ul className="space-y-0.5">
            {confirmedEvents.map((e) => (
              <li key={e.id}>
                <EventRow
                  event={e}
                  member={memberById.get(e.member_id)}
                  onClick={() => router.push(`/calendar?filter=confirmed`)}
                />
              </li>
            ))}
            {confirmedCount > confirmedEvents.length && (
              <li className="text-text-muted text-xs italic px-2 pt-2">
                + {confirmedCount - confirmedEvents.length} no calendário
              </li>
            )}
          </ul>
        </Section>

        {/* 4. Provisórios */}
        <Section
          title="Provisórios"
          icon={<Clock className="w-4 h-4" />}
          iconColor="#F59E0B"
          count={tentativeCount}
          emptyText="Nenhum evento provisório."
          cta={{ label: 'Ver no calendário', href: '/calendar?filter=tentative' }}
        >
          <ul className="space-y-0.5">
            {tentativeEvents.map((e) => (
              <li key={e.id}>
                <EventRow
                  event={e}
                  member={memberById.get(e.member_id)}
                  onClick={() => router.push(`/calendar?filter=tentative`)}
                  rightSlot={
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-warning/40 text-warning bg-warning/10">
                      Provisório
                    </span>
                  }
                />
              </li>
            ))}
            {tentativeCount > tentativeEvents.length && (
              <li className="text-text-muted text-xs italic px-2 pt-2">
                + {tentativeCount - tentativeEvents.length} no calendário
              </li>
            )}
          </ul>
        </Section>

        {/* 5. Eventos cruzados */}
        <Section
          title="Eventos cruzados"
          icon={<AlertTriangle className="w-4 h-4" />}
          iconColor="#F97316"
          count={totalConflicts}
          emptyText="Nenhum conflito de agenda."
          cta={{ label: 'Ver no calendário', href: '/calendar?filter=conflicts' }}
        >
          <ul className="space-y-2">
            {conflictRows.map((c) => {
              const member = memberById.get(c.member_id);
              return (
                <li key={c.id} className="flex items-start gap-3 px-2 -mx-2 py-2 rounded-lg hover:bg-surface-overlay/60 transition-colors">
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
                        Membro afetado: <span className="text-text-secondary">{member.name}</span>
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
            {totalConflicts > conflictRows.length && (
              <li className="text-text-muted text-xs italic px-2 pt-2">
                + {totalConflicts - conflictRows.length} no calendário
              </li>
            )}
          </ul>
        </Section>

        {/* 6. Syncs com falha */}
        <Section
          title="Syncs com falha"
          icon={<RefreshCw className="w-4 h-4" />}
          iconColor="#EF4444"
          count={failedSyncCount}
          emptyText="Nenhuma sincronização com falha."
          cta={failedSyncCount > 0 ? { label: 'Ver no calendário', href: '/calendar?filter=failed-sync' } : undefined}
        >
          <ul className="space-y-0.5">
            {failedEvents.map((e) => (
              <li key={e.id}>
                <EventRow
                  event={e}
                  member={memberById.get(e.member_id)}
                  onClick={() => router.push(`/calendar?filter=failed-sync`)}
                  rightSlot={
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-danger/40 text-danger bg-danger/10 max-w-[140px] truncate"
                      title={e.sync_error ?? 'Falha de sincronização'}
                    >
                      {e.sync_error ? e.sync_error.split(':').pop()?.trim() ?? 'falha' : 'falha'}
                    </span>
                  }
                />
              </li>
            ))}
            {failedEvents.length === 0 && (
              <li className="text-text-muted text-sm italic">Nenhum evento com sync_status=failed.</li>
            )}
          </ul>
        </Section>
      </div>
    </div>
  );
}
