'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { TopBar } from '@/components/layout/TopBar';
import { WeekView } from './WeekView';
import { DayView } from './DayView';
import { MonthView } from './MonthView';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useDeleteEvent } from '@/hooks/useEventMutations';
import { EventSidePanel } from '@/components/events/EventSidePanel';
import { useAuth } from '@/hooks/useAuth';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay, addDays } from '@/lib/calendar/dateUtils';
import type { CalendarEvent } from '@eqr/domain';
import { useAgendaSettings } from '@/hooks/useAgendaSettings';
import { BottomSheet } from '@/components/shared/BottomSheet';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import { useFavorites } from '@/hooks/useFavorites';

type CalendarView = 'day' | 'week' | 'month';

interface MemberOption {
  id: string;
  name: string;
  colorHex: string;
  avatarUrl: string | null;
}

function getDateRange(date: Date, view: CalendarView) {
  if (view === 'day') return { startAt: startOfDay(date), endAt: endOfDay(date) };
  if (view === 'week') return {
    startAt: startOfWeek(date, { weekStartsOn: 0 }),
    endAt: endOfWeek(date, { weekStartsOn: 0 }),
  };
  return {
    startAt: addDays(startOfWeek(startOfMonth(date), { weekStartsOn: 0 }), 0),
    endAt: addDays(endOfWeek(endOfMonth(date), { weekStartsOn: 0 }), 1),
  };
}

interface CalendarRootProps {
  initialMemberId?: string;
  initialFilter?: string;
}

const FILTER_LABELS: Record<string, string> = {
  confirmed: 'Eventos confirmados',
  tentative: 'Eventos provisórios',
  conflicts: 'Eventos cruzados',
  'failed-sync': 'Syncs com falha',
};

// Filtros de status que ficam expostos como chips clicáveis no calendário
type StatusFilterKey = 'confirmed' | 'tentative' | 'conflicts';

const STATUS_FILTERS: Array<{ key: StatusFilterKey; label: string; dotColor: string }> = [
  { key: 'confirmed', label: 'Confirmados', dotColor: '#22C55E' },
  { key: 'tentative', label: 'Provisórios', dotColor: '#F59E0B' },
  { key: 'conflicts', label: 'Cruzados', dotColor: '#F97316' },
];

export function CalendarRoot({ initialMemberId, initialFilter }: CalendarRootProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [view, setView] = useState<CalendarView>('week');
  const { settings } = useAgendaSettings();
  const viewInitialized = useRef(false);

  useEffect(() => {
    if (!viewInitialized.current) {
      viewInitialized.current = true;
      setView(settings.defaultView);
    }
  }, [settings.defaultView]);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [newEventDate, setNewEventDate] = useState<Date | null>(null);
  const [activeMemberIds, setActiveMemberIds] = useState<string[]>(
    initialMemberId ? [initialMemberId] : []
  );
  const [activeFilter, setActiveFilter] = useState<string | undefined>(initialFilter);
  const [showFilteredHours, setShowFilteredHours] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Volta para modo filtrado quando o usuário aplica novos horários
  useEffect(() => {
    setShowFilteredHours(true);
  }, [settings.workStart, settings.workEnd]);

  const { isAdmin, member } = useAuth();
  const supabase = getSupabaseBrowserClient();
  const deleteEvent = useDeleteEvent();
  const { startAt, endAt } = getDateRange(currentDate, view);

  const { data: memberOptions = [] } = useQuery<MemberOption[]>({
    queryKey: ['members-filter-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('members')
        .select('id, name, color_hex, avatar_url')
        .eq('is_active', true)
        .neq('slug', 'admin')
        .order('name');
      return (data ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        colorHex: m.color_hex,
        avatarUrl: m.avatar_url,
      }));
    },
    enabled: isAdmin,
    staleTime: 5 * 60_000,
  });

  const { data: events = [], isLoading } = useCalendarEvents({
    startAt,
    endAt,
    memberIds: isAdmin && activeMemberIds.length > 0 ? activeMemberIds : undefined,
  });

  const { data: favoriteIds } = useFavorites();

  const eventMemberColors: Record<string, string> = useMemo(() => {
    const result: Record<string, string> = {};
    events.forEach((e) => {
      if (!result[e.memberId]) {
        const m = memberOptions.find((mem) => mem.id === e.memberId);
        result[e.memberId] = m?.colorHex ?? '#6B7280';
      }
    });
    return result;
  }, [events, memberOptions]);

  const conflictEventIds = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach((a) => {
      events.forEach((b) => {
        if (a.id !== b.id && a.memberId === b.memberId) {
          if (a.startAt < b.endAt && a.endAt > b.startAt) {
            counts[a.id] = (counts[a.id] ?? 0) + 1;
          }
        }
      });
    });
    return new Set(Object.keys(counts));
  }, [events]);

  const eventsToShow = useMemo(() => {
    if (activeFilter === 'conflicts') return events.filter((e) => conflictEventIds.has(e.id));
    if (activeFilter === 'failed-sync') return events.filter((e) => e.syncStatus === 'failed');
    if (activeFilter === 'tentative') return events.filter((e) => e.status === 'tentative');
    if (activeFilter === 'confirmed') return events.filter((e) => e.status === 'confirmed');
    return events;
  }, [events, conflictEventIds, activeFilter]);

  function toggleMember(id: string) {
    setActiveMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function openNewEvent(date: Date) {
    setNewEventDate(date);
    setSelectedEvent(null);
    setSidePanelOpen(true);
  }

  // Mobile + MonthView: tap num dia abre o painel com data pré-preenchida em horário útil.
  // Se for hoje, usa o próximo slot redondo após "agora"; se for outro dia, usa o início do expediente.
  function openNewEventForDay(day: Date) {
    const now = new Date();
    const isTodayDay =
      day.getFullYear() === now.getFullYear() &&
      day.getMonth() === now.getMonth() &&
      day.getDate() === now.getDate();

    const seed = new Date(day);
    if (isTodayDay) {
      const nextHour = now.getMinutes() === 0 ? now.getHours() : now.getHours() + 1;
      seed.setHours(Math.min(Math.max(nextHour, settings.workStart), settings.workEnd - 1), 0, 0, 0);
    } else {
      seed.setHours(settings.workStart, 0, 0, 0);
    }
    openNewEvent(seed);
  }

  function openEventDetail(event: CalendarEvent) {
    setSelectedEvent(event);
    setNewEventDate(null);
    setSidePanelOpen(true);
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar
        currentDate={currentDate}
        view={view}
        onDateChange={setCurrentDate}
        onViewChange={setView}
        onOpenMobileFilters={() => setMobileFiltersOpen(true)}
        showMobileFilters={view !== 'month' || (isAdmin && memberOptions.length > 0)}
      />

      {/* Member filter pills — admin only — sem o texto "Filtrar" */}
      {isAdmin && memberOptions.length > 0 && (
        <div className="flex items-center gap-2 px-2 sm:px-4 py-2 border-b border-surface-border bg-surface-base overflow-x-auto shrink-0">
          <button
            onClick={() => setActiveMemberIds([])}
            aria-pressed={activeMemberIds.length === 0}
            className={`shrink-0 min-h-[44px] px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
              activeMemberIds.length === 0
                ? 'bg-accent/15 border-accent/40 text-accent scale-105'
                : 'border-surface-border text-text-muted opacity-70 hover:opacity-100 hover:border-surface-muted hover:text-text-secondary'
            }`}
          >
            Todos
          </button>
          {memberOptions.map((m) => {
            const isActive = activeMemberIds.includes(m.id);
            const hasSelection = activeMemberIds.length > 0;
            return (
              <button
                key={m.id}
                onClick={() => toggleMember(m.id)}
                aria-pressed={isActive}
                aria-label={`Filtrar por ${m.name}`}
                title={m.name}
                className={`shrink-0 min-h-[44px] flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  isActive
                    ? 'text-white border-transparent scale-105'
                    : `border-surface-border text-text-muted ${hasSelection ? 'opacity-50' : 'opacity-90'} hover:opacity-100 hover:text-text-secondary`
                }`}
                style={isActive ? { backgroundColor: m.colorHex, borderColor: m.colorHex } : {}}
              >
                <MemberAvatar
                  member={{ name: m.name, colorHex: m.colorHex, avatarUrl: m.avatarUrl }}
                  size="xs"
                />
                <span className="hidden sm:inline">{m.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Filtros de status — chips por tipo (Confirmado / Provisório / Cruzado). Mobile fica dentro do BottomSheet. */}
      <div className="hidden sm:flex items-center gap-2 px-4 py-2 border-b border-surface-border bg-surface-base overflow-x-auto shrink-0">
        <button
          onClick={() => setActiveFilter(undefined)}
          aria-pressed={!activeFilter}
          className={`shrink-0 min-h-[44px] px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
            !activeFilter
              ? 'bg-accent/15 border-accent/40 text-accent scale-105'
              : 'border-surface-border text-text-muted opacity-70 hover:opacity-100 hover:border-surface-muted hover:text-text-secondary'
          }`}
        >
          Todos
        </button>
        {STATUS_FILTERS.map((f) => {
          const isActive = activeFilter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setActiveFilter(isActive ? undefined : f.key)}
              aria-pressed={isActive}
              className={`shrink-0 min-h-[44px] flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                isActive
                  ? 'text-white border-transparent scale-105'
                  : 'border-surface-border text-text-muted opacity-90 hover:opacity-100 hover:text-text-secondary'
              }`}
              style={isActive ? { backgroundColor: f.dotColor, borderColor: f.dotColor } : {}}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isActive ? 'white' : f.dotColor, opacity: isActive ? 0.9 : 1 }} />
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Toggle de faixa de horário — apenas DESKTOP. Mobile usa BottomSheet. */}
      {view !== 'month' && (
        <div className="hidden sm:flex items-center gap-2 px-4 py-2 border-b border-surface-border bg-surface-base shrink-0">
          <span className="text-text-muted text-xs shrink-0">Horário:</span>
          <div className="flex items-center bg-surface-overlay rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => setShowFilteredHours(true)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150 ${
                showFilteredHours
                  ? 'bg-surface-base text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {String(settings.workStart).padStart(2, '0')}h – {String(settings.workEnd).padStart(2, '0')}h
            </button>
            <button
              onClick={() => setShowFilteredHours(false)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150 ${
                !showFilteredHours
                  ? 'bg-surface-base text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Dia completo
            </button>
          </div>
        </div>
      )}

      {/* BottomSheet de filtros mobile — espelha os controles que ficam acima no desktop */}
      <BottomSheet
        open={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
        title="Filtros e exibição"
      >
        <div className="space-y-6 pb-2">
          {view !== 'month' && (
            <section>
              <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Recorte de horário</p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => { setShowFilteredHours(true); }}
                  className={`w-full min-h-[44px] px-4 py-2.5 rounded-lg text-sm font-medium transition-colors text-left border ${
                    showFilteredHours
                      ? 'bg-member-blue/15 border-member-blue text-text-primary'
                      : 'bg-surface-overlay border-surface-border text-text-secondary'
                  }`}
                >
                  {String(settings.workStart).padStart(2, '0')}h – {String(settings.workEnd).padStart(2, '0')}h
                </button>
                <button
                  type="button"
                  onClick={() => { setShowFilteredHours(false); }}
                  className={`w-full min-h-[44px] px-4 py-2.5 rounded-lg text-sm font-medium transition-colors text-left border ${
                    !showFilteredHours
                      ? 'bg-member-blue/15 border-member-blue text-text-primary'
                      : 'bg-surface-overlay border-surface-border text-text-secondary'
                  }`}
                >
                  Dia completo (00h – 24h)
                </button>
              </div>
            </section>
          )}

          <section>
            <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Tipo de evento</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveFilter(undefined)}
                className={`min-h-[44px] px-3 py-2 rounded-full text-sm font-medium transition-all border ${
                  !activeFilter
                    ? 'bg-surface-muted border-surface-muted text-text-primary'
                    : 'border-surface-border text-text-muted'
                }`}
              >
                Todos
              </button>
              {STATUS_FILTERS.map((f) => {
                const isActive = activeFilter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setActiveFilter(isActive ? undefined : f.key)}
                    className={`min-h-[44px] flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-all border ${
                      isActive
                        ? 'text-white border-transparent'
                        : 'border-surface-border text-text-secondary'
                    }`}
                    style={isActive ? { backgroundColor: f.dotColor, borderColor: f.dotColor } : {}}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: isActive ? 'white' : f.dotColor }} />
                    {f.label}
                  </button>
                );
              })}
            </div>
          </section>

          {isAdmin && memberOptions.length > 0 && (
            <section>
              <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Filtrar por membro</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveMemberIds([])}
                  className={`min-h-[44px] px-3 py-2 rounded-full text-sm font-medium transition-all border ${
                    activeMemberIds.length === 0
                      ? 'bg-surface-muted border-surface-muted text-text-primary'
                      : 'border-surface-border text-text-muted'
                  }`}
                >
                  Todos
                </button>
                {memberOptions.map((m) => {
                  const isActive = activeMemberIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleMember(m.id)}
                      className={`min-h-[44px] flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-all border ${
                        isActive
                          ? 'text-white border-transparent'
                          : 'border-surface-border text-text-secondary'
                      }`}
                      style={isActive ? { backgroundColor: m.colorHex, borderColor: m.colorHex } : {}}
                    >
                      <MemberAvatar
                        member={{ name: m.name, colorHex: m.colorHex, avatarUrl: m.avatarUrl }}
                        size="xs"
                      />
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </BottomSheet>

      {/* Barra de filtro especial (horários cruzados / sync com falha) */}
      {activeFilter && FILTER_LABELS[activeFilter] && (
        <div className="flex items-center gap-2 px-2 sm:px-4 py-2 border-b border-warning/30 bg-warning/5 shrink-0">
          <span className="text-warning text-xs font-medium">
            Mostrando: {FILTER_LABELS[activeFilter]}
          </span>
          <span className="text-text-muted text-xs">({eventsToShow.length} eventos)</span>
          <button
            onClick={() => setActiveFilter(undefined)}
            className="ml-auto p-0.5 rounded hover:bg-warning/20 transition-colors text-warning"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <AnimatePresence>
          <motion.div
            key={view}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col flex-1 overflow-hidden relative"
          >
            {isLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-base/50">
                <div className="flex flex-col items-center gap-2">
                  <svg className="animate-spin h-6 w-6 text-accent" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-text-muted text-xs">Carregando eventos...</span>
                </div>
              </div>
            )}

            {view === 'week' && (
              <WeekView
                currentDate={currentDate}
                events={eventsToShow}
                memberColors={eventMemberColors}
                conflictEventIds={conflictEventIds}
                favoriteEventIds={favoriteIds}
                onEventClick={openEventDetail}
                onSlotClick={openNewEvent}
                onDeleteEvent={(id) => deleteEvent.mutate(id)}
                workStart={settings.workStart}
                workEnd={settings.workEnd}
                filteredHours={showFilteredHours}
              />
            )}
            {view === 'day' && (
              <DayView
                currentDate={currentDate}
                events={eventsToShow}
                memberColors={eventMemberColors}
                conflictEventIds={conflictEventIds}
                favoriteEventIds={favoriteIds}
                onEventClick={openEventDetail}
                onSlotClick={openNewEvent}
                onDeleteEvent={(id) => deleteEvent.mutate(id)}
                workStart={settings.workStart}
                workEnd={settings.workEnd}
                filteredHours={showFilteredHours}
              />
            )}
            {view === 'month' && (
              <MonthView
                currentDate={currentDate}
                events={eventsToShow}
                memberColors={eventMemberColors}
                conflictEventIds={conflictEventIds}
                favoriteEventIds={favoriteIds}
                onEventClick={openEventDetail}
                onDayClick={(date) => { setCurrentDate(date); setView('day'); }}
                onDayCreate={openNewEventForDay}
                onDeleteEvent={(id) => deleteEvent.mutate(id)}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Side Panel */}
        <EventSidePanel
          open={sidePanelOpen}
          event={selectedEvent}
          initialDate={newEventDate ?? undefined}
          onClose={() => setSidePanelOpen(false)}
        />
      </div>
    </div>
  );
}
