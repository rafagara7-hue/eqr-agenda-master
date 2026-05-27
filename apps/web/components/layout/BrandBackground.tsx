'use client';

import { EQR_LOGO_DATA_URL } from '@/lib/logoData';

/**
 * Plano de fundo decorativo com elementos da marca EQR — discreto e fixo
 * atrás de todo o conteúdo. Brilhos dourados ambientes + marca d'água do
 * monograma EQR em opacidade baixíssima. Renderizado apenas no tema EQR.
 */
export function BrandBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden="true"
    >
      {/* Brilhos dourados ambientes — dão profundidade sem competir com o conteúdo */}
      <div className="absolute -top-40 -right-32 w-[520px] h-[520px] rounded-full bg-accent/[0.045] blur-3xl" />
      <div className="absolute top-1/3 -left-48 w-[460px] h-[460px] rounded-full bg-accent/[0.025] blur-3xl" />
      <div className="absolute -bottom-52 left-1/4 w-[600px] h-[600px] rounded-full bg-surface-muted/[0.12] blur-3xl" />

      {/* Marca d'água do monograma EQR — canto inferior direito, bem sutil */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={EQR_LOGO_DATA_URL}
        alt=""
        className="absolute -bottom-12 -right-12 w-72 h-72 opacity-[0.04] rotate-[-6deg] select-none"
      />

      {/* Segundo monograma, topo esquerdo, ainda mais discreto */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={EQR_LOGO_DATA_URL}
        alt=""
        className="absolute top-20 -left-16 w-56 h-56 opacity-[0.025] rotate-[8deg] select-none"
      />
    </div>
  );
}
