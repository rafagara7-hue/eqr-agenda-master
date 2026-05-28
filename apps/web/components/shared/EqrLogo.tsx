'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Logo EQR oficial — imagem hospedada na CDN da Framer (CDN do site eqr.com.br).
 * Se a CDN ficar fora do ar, cai num SVG inline como fallback.
 *
 * Quando `blend` é true, sobrepõe um gradiente radial com a cor de fundo do
 * site (`--surface-elevated`), criando um fade nas bordas que dissolve o
 * quadrado cream da logo no fundo escuro.
 */
const EQR_LOGO_URL =
  'https://framerusercontent.com/images/l4E2MMrryjUAjpj8g7kIgqtGUSw.webp?width=395&height=400';

export function EqrLogo({
  className,
  title = 'EQR',
  blend = false,
}: {
  className?: string;
  title?: string;
  blend?: boolean;
}) {
  const [imgError, setImgError] = useState(false);

  const inner = !imgError ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={EQR_LOGO_URL}
      alt={title}
      className={blend ? 'w-full h-full block' : className}
      loading="eager"
      decoding="async"
      onError={() => setImgError(true)}
    />
  ) : (
    <svg
      viewBox="0 0 100 100"
      className={blend ? 'w-full h-full' : className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
    >
      <text
        x="50" y="44" textAnchor="middle" dominantBaseline="central"
        fontFamily="'Cinzel', 'Playfair Display', Georgia, serif"
        fontSize="36" fontWeight="600" letterSpacing="-0.5" fill="#C3A25E"
      >EQR</text>
      <path d="M40 70 Q50 78 60 73" stroke="#C3A25E" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="61.5" cy="74" r="1.8" fill="#C3A25E" />
    </svg>
  );

  if (!blend) return inner;

  return (
    <div className={cn('relative overflow-hidden', className)} style={{ opacity: 0.95 }}>
      {inner}
      {/* Overlay radial: transparente no centro, vira cor do bg do site nas bordas */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at center, transparent 25%, rgb(var(--surface-elevated-rgb)) 92%)',
        }}
      />
    </div>
  );
}
