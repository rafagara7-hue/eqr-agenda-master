'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X, Edit2, Trash2, MapPin, Clock, User2, Calendar, Users, Star } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EventForm } from './EventForm';
import { SyncStatusBadge } from '@/components/calendar/SyncStatusBadge';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import { useDeleteEvent } from '@/hooks/useEventMutations';
import { useAuth } from '@/hooks/useAuth';
import { useFavorites, useToggleFavorite } from '@/hooks/useFavorites';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { formatDate } from '@/lib/calendar/dateUtils';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
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
  const { data: favorites } = useFavorites();
  const toggleFavorite = useToggleFavorite();
  const isFavorite = !!event && !!favorites?.has(event.id);
  const canEdit = isAdmin || (!!event && !!member && (
    event.memberId === member.id
    || event.createdBy === member.id
    || (event.participantIds ?? []).includes(member.id)
  ));
  const canFavorite = !!member;
  const supabase = getSupabaseBrowserClient();
  const { t } = useTranslation();

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
    if (!confirm(`${t('event.delete')} "${event.title}"?`)) return;
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
            {/* Header — barra fixa no topo do painel com botões em destaque */}
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-surface-border bg-surface-elevated flex-shrink-0">
              <h2 className="text-text-primary font-semibold text-base truncate">
                {isNewEvent ? t('event.new') : isEditing ? t('event.edit') : t('event.details')}
              </h2>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                {!isNewEvent && canFavorite && !isEditing && event && (
                  <button
                    type="button"
                    onClick={() => toggleFavorite.mutate({ eventId: event.id, isFavorite })}
                    className={cn(
                      'p-2 rounded-lg border transition-all duration-150 min-w-[36px] min-h-[36px] flex items-center justify-center',
                      isFavorite
                        ? 'border-favorite/50 bg-favorite/10 text-favorite hover:bg-favorite/20'
                        : 'border-surface-border bg-surface-overlay text-text-secondary hover:border-favorite/40 hover:text-favorite'
                    )}
                    title={isFavorite ? t('event.unfavorite') : t('event.favorite')}
                    aria-label={isFavorite ? t('event.unfavorite') : t('event.favorite')}
                  >
                    <Star className="w-4 h-4" fill={isFavorite ? '#C9A84C' : 'none'} />
                  </button>
                )}
                {!isNewEvent && canEdit && !isEditing && (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="p-2 rounded-lg border border-surface-border bg-surface-overlay text-text-secondary hover:border-member-blue/50 hover:text-member-blue hover:bg-member-blue/10 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                      title={t('common.edit')}
                      aria-label={t('common.edit')}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete()}
                      className="p-2 rounded-lg border border-surface-border bg-surface-overlay text-text-secondary hover:border-danger/50 hover:text-danger hover:bg-danger/10 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                      title={t('common.delete')}
                      aria-label={t('common.delete')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
                {/* Botão X fechar — sempre visível, em destaque */}
                <button
                  type="button"
                  onClick={handleClose}
                  className="p-2 rounded-lg border border-surface-border bg-surface-overlay text-text-primary hover:bg-danger/15 hover:border-danger/50 hover:text-danger transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                  title={t('common.close')}
                  aria-label={t('common.close')}
                >
                  <X className="w-5 h-5" />
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
  const { t } = useTranslation();

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
            <p className="text-text-muted text-xs uppercase tracking-wider">{t('event.jointMeeting')}</p>
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
          <p className="text-text-secondary text-sm font-semibold">{t('event.descriptionLabel')}</p>
          <p className="text-text-secondary text-sm whitespace-pre-line">{event.description}</p>
        </div>
      )}

      {/* Metadados */}
      <div className="border-t border-surface-border pt-4 space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-text-muted">{t('event.createdAt')}</span>
          <span className="text-text-secondary">{formatDate(event.createdAt, 'dd/MM/yyyy HH:mm')}</span>
        </div>
        {event.lastSyncedAt && (
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">{t('event.lastSync')}</span>
            <span className="text-text-secondary">{formatDate(event.lastSyncedAt, 'dd/MM/yyyy HH:mm')}</span>
          </div>
        )}
        {event.googleEventId && (
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">{t('profilePanel.googleCalendar')}</span>
            <span className="text-success text-xs">{t('common.linked')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
