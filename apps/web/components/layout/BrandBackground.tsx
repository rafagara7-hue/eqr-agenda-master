/**
 * Plano de fundo decorativo com elementos da marca EQR — discreto e fixo
 * atrás de todo o conteúdo. Brilhos dourados ambientes + marca d'água do
 * monograma EQR (SVG inline, sem fundo) em opacidade baixíssima.
 */
function EqrWatermark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="presentation"
      aria-hidden="true"
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
}

export function BrandBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden="true"
    >
      {/* Brilhos dourados ambientes — dão profundidade sem competir com o conteúdo */}
      <div className="absolute -top-40 -right-32 w-[520px] h-[520px] rounded-full bg-accent/[0.04] blur-3xl" />
      <div className="absolute top-1/3 -left-48 w-[460px] h-[460px] rounded-full bg-accent/[0.02] blur-3xl" />
      <div className="absolute -bottom-52 left-1/4 w-[600px] h-[600px] rounded-full bg-surface-muted/[0.10] blur-3xl" />

      {/* Marca d'água SVG do monograma EQR — sem fundo, super sutil */}
      <EqrWatermark className="absolute -bottom-8 -right-8 w-64 h-64 opacity-[0.03] rotate-[-6deg]" />
      <EqrWatermark className="absolute top-24 -left-12 w-48 h-48 opacity-[0.02] rotate-[8deg]" />
    </div>
  );
}
