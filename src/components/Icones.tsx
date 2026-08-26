/**
 * src/components/Icones.tsx
 * ---------------------------------------------------------------
 * Ícones em SVG inline, desenhados só com traço (nunca preenchidos) e
 * sempre em `currentColor` — herdam a cor de quem os usa, então nunca
 * introduzem uma cor nova na paleta.
 *
 * São inline de propósito: o app precisa abrir numa cozinha com wifi
 * ruim e não pode depender de CDN de fontes de ícone (mesma razão pela
 * qual não há fonte externa em index.css).
 *
 * Traço de 1.8 e cantos arredondados mantêm o tom discreto do resto do
 * layout — ícone de traço fino "pesa" menos na tela que ícone sólido, e
 * a instrução do dono do negócio foi justamente manter o tom calmo.
 */

interface IconeProps {
  /** Tamanho em px. Padrão 18, que alinha com texto de 15-16px. */
  tamanho?: number;
  className?: string;
}

function Svg({
  tamanho = 18,
  className,
  children,
}: IconeProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Seta de abrir/fechar. Gira via CSS quando a sessão está aberta. */
export function IconeSeta(props: IconeProps) {
  return (
    <Svg {...props}>
      <polyline points="6 9 12 15 18 9" />
    </Svg>
  );
}

export function IconeLixeira(props: IconeProps) {
  return (
    <Svg {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </Svg>
  );
}

export function IconeCalendario(props: IconeProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </Svg>
  );
}

export function IconeConfere(props: IconeProps) {
  return (
    <Svg {...props}>
      <polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

export function IconeAtencao(props: IconeProps) {
  return (
    <Svg {...props}>
      <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </Svg>
  );
}

export function IconeBalanca(props: IconeProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v18M7 21h10" />
      <path d="M5 7h14" />
      <path d="M5 7l-3 6a3 3 0 0 0 6 0z" />
      <path d="M19 7l3 6a3 3 0 0 1-6 0z" />
    </Svg>
  );
}

export function IconeCadeado(props: IconeProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

export function IconeImpressora(props: IconeProps) {
  return (
    <Svg {...props}>
      <path d="M6 9V3h12v6" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <path d="M6 14h12v7H6z" />
    </Svg>
  );
}

/** Forno — usado na marcação de fornada pronta. */
export function IconeForno(props: IconeProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18" />
      <path d="M7 6.5h.01M10 6.5h.01" />
      <rect x="7" y="12" width="10" height="6" rx="1" />
    </Svg>
  );
}
