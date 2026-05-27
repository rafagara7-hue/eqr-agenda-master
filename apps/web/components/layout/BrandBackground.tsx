'use client';

import { EqrLogo } from '@/components/shared/EqrLogo';

/**
 * Plano de fundo decorativo com elementos da marca EQR — discreto e fixo
 * atrás de todo o conteúdo. Brilhos dourados ambientes + marca d'água do
 * monograma EQR (SVG inline) em opacidade baixíssima. Só no tema EQR.
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
      <div className="absolute -bottom-12 -right-12 w-72 h-72 opacity-[0.05] rotate-[-6deg]">
        <EqrLogo className="w-full h-full" />
      </div>

      {/* Segundo monograma, topo esquerdo, ainda mais discreto */}
      <div className="absolute top-20 -left-16 w-56 h-56 opacity-[0.03] rotate-[8deg]">
        <EqrLogo className="w-full h-full" />
      </div>
    </div>
  );
}
