/**
 * Logo EQR — SVG inline com a versão cream (fundo off-white EQR + monograma dourado).
 * Renderiza como elementos DOM, imune a bloqueio de imagem/cache.
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
      {/* Fundo cream/off-white EQR */}
      <rect width="100" height="100" rx="14" fill="#EFE8DB" />

      {/* Monograma EQR em dourado, serifa elegante condensada */}
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="'Playfair Display', 'Cormorant Garamond', Georgia, 'Times New Roman', serif"
        fontSize="42"
        fontWeight="500"
        letterSpacing="-1"
        fill="#C3A25E"
      >
        EQR
      </text>

      {/* Ornamento dourado — pequeno swoosh estilizado abaixo do monograma */}
      <path
        d="M42 76 Q48 80 54 77 Q58 74 55 71 Q52 69 50 72"
        stroke="#C3A25E"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Pingo do ornamento */}
      <circle cx="56.5" cy="79" r="1.8" fill="#C3A25E" />
    </svg>
  );
}
