'use client';

import { cn } from '@/lib/utils';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import { Check } from 'lucide-react';

export interface MemberOption {
  id: string;
  name: string;
  colorHex: string;
  avatarUrl: string | null;
}

interface MemberSelectorProps {
  value: string;
  onChange: (memberId: string) => void;
  members: MemberOption[];
  disabled?: boolean;
}

export function MemberSelector({ value, onChange, members, disabled = false }: MemberSelectorProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-text-secondary">Membro</label>
      <div className="flex gap-2 flex-wrap">
        {members.map((m) => {
          const isSelected = value === m.id;
          return (
            <button
              key={m.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(m.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-150',
                'text-sm font-medium',
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
