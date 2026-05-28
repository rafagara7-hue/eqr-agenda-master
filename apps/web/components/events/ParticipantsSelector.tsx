'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import { Check, UserPlus, X } from 'lucide-react';
import type { MemberOption } from './MemberSelector';
import { useTranslation } from '@/lib/i18n';

interface ParticipantsSelectorProps {
  value: string[];
  onChange: (participantIds: string[]) => void;
  members: MemberOption[];
  hostId: string;
  disabled?: boolean;
}

export function ParticipantsSelector({ value, onChange, members, hostId, disabled = false }: ParticipantsSelectorProps) {
  const [expanded, setExpanded] = useState(value.length > 0);
  const { t } = useTranslation();

  function toggle(id: string) {
    if (id === hostId) return;
    if (value.includes(id)) {
      onChange(value.filter((p) => p !== id));
    } else {
      onChange([...value, id]);
    }
  }

  function handleClose() {
    if (value.length > 0) onChange([]);
    setExpanded(false);
  }

  const additional = members.filter((m) => m.id !== hostId);

  if (additional.length === 0) return null;

  if (!expanded) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setExpanded(true)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-surface-border',
          'text-sm font-medium text-text-secondary hover:text-text-primary hover:border-surface-muted',
          'transition-colors w-full justify-center',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <UserPlus className="w-4 h-4" />
        {t('event.addPartners')}
      </button>
    );
  }

  return (
    <div className="space-y-1.5 rounded-lg border border-surface-border bg-surface-overlay/30 p-3">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-text-secondary">{t('participants.partnersInMeeting')}</label>
          <p className="text-text-muted text-xs">
            {t('participants.markOthers')}
          </p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors"
          title={t('participants.removeAllHide')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex gap-2 flex-wrap pt-1">
        {additional.map((m) => {
          const isSelected = value.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              disabled={disabled}
              onClick={() => toggle(m.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-150',
                'text-xs font-medium',
                isSelected
                  ? 'border-transparent text-white'
                  : 'border-surface-border text-text-secondary hover:border-surface-muted hover:text-text-primary',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
              style={isSelected ? { backgroundColor: m.colorHex, borderColor: m.colorHex } : {}}
            >
              <MemberAvatar
                member={{ name: m.name, colorHex: m.colorHex, avatarUrl: m.avatarUrl }}
                size="xs"
              />
              <span>{m.name}</span>
              {isSelected && <Check className="w-3 h-3 ml-0.5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
