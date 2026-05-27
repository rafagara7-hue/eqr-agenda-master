/**
 * Logo EQR como SVG inline (elementos DOM, não <img>).
 * Renderiza sempre — imune a bloqueio de data: URI, cache de asset ou falha de rede.
 * Monograma "EQR" dourado sobre fundo azul-noite, com swoosh característico.
 */
export function EqrLogo({ className, title = 'EQR' }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Fundo azul-noite EQR */}
      <rect width="100" height="100" rx="22" fill="#0D1B2A" />
      {/* Monograma EQR em dourado, fonte serifada elegante */}
      <text
        x="50"
        y="52"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Georgia, 'Times New Roman', 'Playfair Display', serif"
        fontSize="30"
        fontWeight="600"
        letterSpacing="0.5"
        fill="#C9A85C"
      >
        EQR
      </text>
      {/* Swoosh dourado característico sob o monograma */}
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
