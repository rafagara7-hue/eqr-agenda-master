/**
 * Logo EQR — SVG inline, fundo transparente.
 * Apenas o monograma "EQR" dourado (Cinzel) + ornamento (swoosh + pingo),
 * sem nenhum quadrado/retângulo de fundo. Sempre renderiza, em qualquer tema.
 * A prop `blend` aplica 95% de opacidade pra suavizar contra fundos claros/escuros.
 */
export function EqrLogo({
  className,
  title = 'EQR',
  blend = false,
}: {
  className?: string;
  title?: string;
  blend?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      style={blend ? { opacity: 0.95 } : undefined}
    >
      {/* Monograma EQR em dourado, fonte Cinzel (Roman classical serif) */}
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
      {/* Ornamento dourado abaixo — swoosh + pingo */}
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
