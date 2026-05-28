'use client';

import { useState } from 'react';

/**
 * Logo EQR oficial — hospedada na CDN da Framer (CDN do site eqr.com.br).
 * Se a CDN ficar fora do ar, cai num SVG inline como fallback.
 *
 * Quando `blend` é true, aplica máscara radial pra fade nas bordas e reduz
 * 5% da opacidade — disfarça o quadrado cream contra fundos escuros (avatar,
 * brand do topbar, marca d'água).
 */
const EQR_LOGO_URL =
  'https://framerusercontent.com/images/l4E2MMrryjUAjpj8g7kIgqtGUSw.webp?width=395&height=400';

const BLEND_STYLE = {
  maskImage: 'radial-gradient(circle at center, black 35%, transparent 95%)',
  WebkitMaskImage: 'radial-gradient(circle at center, black 35%, transparent 95%)',
  opacity: 0.95,
} as const;

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
  const style = blend ? BLEND_STYLE : undefined;

  if (!imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={EQR_LOGO_URL}
        alt={title}
        className={className}
        loading="eager"
        decoding="async"
        onError={() => setImgError(true)}
        style={style}
      />
    );
  }

  // Fallback SVG
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      style={style}
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
}
