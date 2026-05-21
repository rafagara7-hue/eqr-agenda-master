'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X, Edit2, Trash2, MapPin, Clock, User2, Calendar, Users } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EventForm } from './EventForm';
import { SyncStatusBadge } from '@/components/calendar/SyncStatusBadge';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import { useDeleteEvent } from '@/hooks/useEventMutations';
import { useAuth } from '@/hooks/useAuth';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { formatDate } from '@/lib/calendar/dateUtils';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@eqr/domain';

interface EventSidePanelProps {
  open: boolean;
  event: CalendarEvent | null;
  initialDate?: Date;
  onClose: () => void;
}

export function EventSidePanel({ open, event, initialDate, onClose }: EventSidePanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const deleteEvent = useDeleteEvent();
  const { isAdmin, member } = useAuth();
  const canEdit = isAdmin || (!!event && !!member && (
    event.memberId === member.id
    || event.createdBy === member.id
    || (event.participantIds ?? []).includes(member.id)
  ));
  const supabase = getSupabaseBrowserClient();

  const { data: memberInfo } = useQuery({
    queryKey: ['member-info', event?.memberId],
    queryFn: async () => {
      const { data } = await supabase
        .from('members')
        .select('name, color_hex, avatar_url')
        .eq('id', event!.memberId)
        .single();
      return data;
    },
    enabled: !!event?.memberId,
    staleTime: 5 * 60_000,
  });

  const participantIds = event?.participantIds ?? [];
  const { data: allParticipants = [] } = useQuery({
    queryKey: ['event-participants', event?.id, participantIds.join(',')],
    queryFn: async () => {
      const { data } = await supabase
        .from('members')
        .select('id, name, color_hex, avatar_url')
        .in('id', participantIds);
      return (data ?? []) as Array<{ id: string; name: string; color_hex: string; avatar_url: string | null }>;
    },
    enabled: !!event && participantIds.length > 1,
    staleTime: 5 * 60_000,
  });

  const isNewEvent = !event;

  function handleClose() {
    setIsEditing(false);
    onClose();
  }

  async function handleDelete() {
    if (!event) return;
    if (!confirm(`Remover "${event.title}"?`)) return;
    await deleteEvent.mutateAsync(event.id);
    handleClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay em mobile */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-20 lg:hidden"
            onClick={handleClose}
          />

          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={cn(
              'fixed right-0 top-0 bottom-0 w-full sm:w-[380px] z-30',
              'bg-surface-overlay border-l border-surface-border',
              'flex flex-col shadow-modal'
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
              <h2 className="text-text-primary font-semibold text-sm">
                {isNewEvent ? 'Novo evento' : isEditing ? 'Editar evento' : 'Detalhes do evento'}
              </h2>

              <div className="flex items-center gap-1">
                {!isNewEvent && canEdit && !isEditing && (
                  <>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="p-1.5 rounded-md hover:bg-surface-elevated transition-colors text-text-muted hover:text-text-secondary"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => void handleDelete()}
                      className="p-1.5 rounded-md hover:bg-danger/10 transition-colors text-text-muted hover:text-danger"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
                <button
                  onClick={handleClose}
                  className="p-1.5 rounded-md hover:bg-surface-elevated transition-colors text-text-muted hover:text-text-primary"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {isNewEvent || isEditing ? (
                <div className="p-5">
                  <EventForm
                    event={isEditing ? event! : undefined}
                    initialDate={initialDate}
                    onSuccess={handleClose}
                    onCancel={() => {
                      if (isEditing) setIsEditing(false);
                      else handleClose();
                    }}
                  />
                </div>
              ) : event ? (
                <EventDetail event={event} memberInfo={memberInfo ?? null} allParticipants={allParticipants} />
              ) : null}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

interface MemberInfo {
  name: string;
  color_hex: string;
  avatar_url: string | null;
}

function EventDetail({
  event,
  memberInfo,
  allParticipants,
}: {
  event: CalendarEvent;
  memberInfo: MemberInfo | null;
  allParticipants: Array<{ id: string; name: string; color_hex: string; avatar_url: string | null }>;
}) {
  const isJoint = (event.participantIds?.length ?? 1) > 1;

  return (
    <div className="p-5 space-y-5">
      {/* Barra de cor do membro */}
      <div className="flex items-start gap-3">
        <div
          className="w-1 rounded-full flex-shrink-0 self-stretch"
          style={{ backgroundColor: memberInfo?.color_hex ?? '#6B7280' }}
        />
        <div className="flex-1">
          <h3 className="text-text-primary font-semibold text-base leading-tight">{event.title}</h3>
          <div className="flex items-center gap-2 mt-1.5">
            <SyncStatusBadge status={event.syncStatus} showLabel />
          </div>
        </div>
      </div>

      {/* Participantes (reunião conjunta) ou Membro único */}
      {isJoint ? (
        <div className="flex items-start gap-3">
          <Users className="w-4 h-4 text-text-muted flex-shrink-0 mt-1" />
          <div className="flex-1 space-y-1.5">
            <p className="text-text-muted text-xs uppercase tracking-wider">Reunião em conjunto</p>
            <div className="flex flex-wrap gap-1.5">
              {allParticipants.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-surface-border bg-surface-elevated"
                >
                  <MemberAvatar
                    member={{ name: p.name, colorHex: p.color_hex, avatarUrl: p.avatar_url }}
                    size="xs"
                  />
                  <span className="text-text-secondary text-xs">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : memberInfo && (
        <div className="flex items-center gap-3">
          <User2 className="w-4 h-4 text-text-muted flex-shrink-0" />
          <div className="flex items-center gap-2">
            <MemberAvatar
              member={{ name: memberInfo.name, colorHex: memberInfo.color_hex, avatarUrl: memberInfo.avatar_url }}
              size="xs"
            />
            <span className="text-text-secondary text-sm">{memberInfo.name}</span>
          </div>
        </div>
      )}

      {/* Data/hora */}
      <div className="flex items-start gap-3">
        <Clock className="w-4 h-4 text-text-muted flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-text-secondary text-sm">
            {formatDate(event.startAt, "EEEE, d 'de' MMMM yyyy")}
          </p>
          <p className="text-text-muted text-xs mt-0.5">
            {event.allDay
              ? 'Dia inteiro'
              : `${formatDate(event.startAt, 'HH:mm')} – ${formatDate(event.endAt, 'HH:mm')}`}
          </p>
        </div>
      </div>

      {/* Local */}
      {event.location && (
        <div className="flex items-center gap-3">
          <MapPin className="w-4 h-4 text-text-muted flex-shrink-0" />
          <p className="text-text-secondary text-sm">{event.location}</p>
        </div>
      )}

      {/* Descrição */}
      {event.description && (
        <div className="space-y-2">
          <p className="text-text-secondary text-sm font-semibold">Descrição</p>
          <p className="text-text-secondary text-sm whitespace-pre-line">{event.description}</p>
        </div>
      )}

      {/* Metadados */}
      <div className="border-t border-surface-border pt-4 space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-text-muted">Criado em</span>
          <span className="text-text-secondary">{formatDate(event.createdAt, 'dd/MM/yyyy HH:mm')}</span>
        </div>
        {event.lastSyncedAt && (
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Último sync</span>
            <span className="text-text-secondary">{formatDate(event.lastSyncedAt, 'dd/MM/yyyy HH:mm')}</span>
          </div>
        )}
        {event.googleEventId && (
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Google Calendar</span>
            <span className="text-success text-xs">Vinculado</span>
          </div>
        )}
      </div>
    </div>
  );
}
