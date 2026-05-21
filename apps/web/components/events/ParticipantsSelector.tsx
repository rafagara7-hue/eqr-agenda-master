'use client';

import { cn } from '@/lib/utils';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import { Check, Users } from 'lucide-react';
import type { MemberOption } from './MemberSelector';

interface ParticipantsSelectorProps {
  value: string[];
  onChange: (participantIds: string[]) => void;
  members: MemberOption[];
  hostId: string;
  disabled?: boolean;
}

export function ParticipantsSelector({ value, onChange, members, hostId, disabled = false }: ParticipantsSelectorProps) {
  function toggle(id: string) {
    if (id === hostId) return;
    if (value.includes(id)) {
      onChange(value.filter((p) => p !== id));
    } else {
      onChange([...value, id]);
    }
  }

  const additional = members.filter((m) => m.id !== hostId);

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-sm font-medium text-text-secondary">
        <Users className="w-3.5 h-3.5" />
        Participantes adicionais (opcional)
      </label>
      <p className="text-text-muted text-xs -mt-0.5">
        Marque outros membros para criar uma reunião em conjunto. Conflitos não serão sinalizados entre vocês neste evento.
      </p>
      {additional.length === 0 ? (
        <p className="text-text-muted text-xs italic">Nenhum outro membro disponível.</p>
      ) : (
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
      )}
    </div>
  );
}
