'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { EqrLogo } from './EqrLogo';
import type { Member } from '@eqr/domain';

interface MemberAvatarProps {
  member: Pick<Member, 'name' | 'colorHex' | 'avatarUrl'>;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  xs: 'w-5 h-5 text-[10px]',
  sm: 'w-7 h-7 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-11 h-11 text-base',
};

// Sentinela: quando avatarUrl é esse valor, renderiza a logo EQR (SVG inline).
const EQR_LOGO_SENTINEL = 'eqr-logo';

export function MemberAvatar({ member, size = 'md', className }: MemberAvatarProps) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [member.avatarUrl]);

  const initials = member.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // Caso especial: logo EQR como avatar (admin).
  // Aplica uma máscara radial pra fade nas bordas (disfarça o quadrado cream
  // contra o fundo escuro do calendário) e reduz 5% da opacidade pra suavizar.
  if (member.avatarUrl === EQR_LOGO_SENTINEL) {
    return (
      <div
        className={cn('rounded-full flex-shrink-0 overflow-hidden opacity-95', sizeMap[size], className)}
        style={{
          maskImage: 'radial-gradient(circle at center, black 55%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(circle at center, black 55%, transparent 100%)',
        }}
        title={member.name}
      >
        <EqrLogo className="w-full h-full" title={member.name} />
      </div>
    );
  }

  const showImage = Boolean(member.avatarUrl) && !imgError;

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0 overflow-hidden',
        sizeMap[size],
        className
      )}
      style={{ backgroundColor: member.colorHex }}
      title={member.name}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={member.avatarUrl as string}
          alt={member.name}
          className="w-full h-full rounded-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        initials
      )}
    </div>
  );
}
