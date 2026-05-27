'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
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

export function MemberAvatar({ member, size = 'md', className }: MemberAvatarProps) {
  const [imgError, setImgError] = useState(false);

  // Reseta o erro se a URL mudar (ex: troca de foto)
  useEffect(() => {
    setImgError(false);
  }, [member.avatarUrl]);

  const initials = member.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

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
