'use client';

import { useState, useEffect } from 'react';
import { EQR_LOGO_DATA_URL } from '@/lib/logoData';

/**
 * Logo EQR — renderiza o PNG oficial via data URL (sempre embarcado, sem requisição
 * extra). Se por qualquer motivo o `<img>` falhar (extensão bloqueando data URI,
 * cache estranho), cai num SVG inline com o monograma "EQR" como fallback —
 * garantindo que algo sempre apareça.
 */
export function EqrLogo({ className, title = 'EQR' }: { className?: string; title?: string }) {
  const [imgError, setImgError] = useState(false);

  // Garante que se o componente remonta com nova URL, tenta o PNG de novo.
  useEffect(() => { setImgError(false); }, []);

  if (!imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={EQR_LOGO_DATA_URL}
        alt={title}
        className={className}
        loading="eager"
        decoding="async"
        onError={() => setImgError(true)}
      />
    );
  }

  // Fallback SVG — só roda se o PNG falhar
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="100" height="100" rx="22" fill="#0D1B2A" />
      <text
        x="50"
        y="52"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="30"
        fontWeight="600"
        letterSpacing="0.5"
        fill="#C9A85C"
      >
        EQR
      </text>
      <path
        d="M30 70 Q50 82 70 70"
        stroke="#C9A85C"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />
    </svg>
  );
}
