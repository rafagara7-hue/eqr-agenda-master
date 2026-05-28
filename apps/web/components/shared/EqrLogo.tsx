/**
 * Logo EQR — monograma "EQR" dourado em fonte serifada clássica (Cinzel),
 * SEM fundo (transparente), com pequeno ornamento dourado abaixo das letras.
 * Renderiza como elementos DOM (SVG inline), imune a bloqueio de imagem/cache.
 */
export function EqrLogo({ className, title = 'EQR' }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Monograma EQR — Cinzel (Roman classical serif) em dourado */}
      <text
        x="50"
        y="44"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="'Cinzel', 'Playfair Display', 'Cormorant Garamond', Georgia, 'Times New Roman', serif"
        fontSize="36"
        fontWeight="600"
        letterSpacing="-0.5"
        fill="#C3A25E"
      >
        EQR
      </text>

      {/* Ornamento dourado abaixo — swoosh + pingo, inspirado na sua imagem */}
      <path
        d="M40 70 Q50 78 60 73"
        stroke="#C3A25E"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="61.5" cy="74" r="1.8" fill="#C3A25E" />
    </svg>
  );
}
