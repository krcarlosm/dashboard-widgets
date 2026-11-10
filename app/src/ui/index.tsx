import React, { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertCircle, Info, TriangleAlert, WifiOff, X } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Componentes compartilhados dos widgets. Usam só tokens (src/theme/tokens.ts),
// então funcionam nos temas claro/escuro, nas densidades e com a cor da instância
// (--widget-accent). Fora de um widget, --widget-accent cai no acento do app.
// ─────────────────────────────────────────────────────────────────────────────

const ACCENT = 'var(--widget-accent, var(--app-accent))';
const ACCENT_STRONG = 'var(--widget-accent-strong, var(--app-accent-strong))';
const ACCENT_SOFT = 'var(--widget-accent-soft, var(--app-accent-soft))';
const ACCENT_BORDER = 'var(--widget-accent-border, var(--app-accent-border))';

export type Tone = 'accent' | 'neutral' | 'success' | 'warning' | 'danger';

const toneColors: Record<Tone, { color: string; soft: string; border: string }> = {
  accent: { color: ACCENT, soft: ACCENT_SOFT, border: ACCENT_BORDER },
  neutral: { color: 'var(--app-muted)', soft: 'var(--app-surface-muted)', border: 'var(--app-border)' },
  success: { color: 'var(--app-success)', soft: 'var(--app-success-soft)', border: 'var(--app-success)' },
  warning: { color: 'var(--app-warning)', soft: 'var(--app-warning-soft)', border: 'var(--app-warning)' },
  danger: { color: 'var(--app-danger)', soft: 'var(--app-danger-soft)', border: 'var(--app-danger)' },
};

// ── Botões ───────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  block?: boolean;
}

const buttonVariants: Record<ButtonVariant, React.CSSProperties> = {
  primary: { background: ACCENT_STRONG, color: 'var(--app-on-accent)', border: '1px solid transparent' },
  secondary: { background: 'var(--app-surface-elevated)', color: 'var(--app-text)', border: '1px solid var(--app-border)' },
  ghost: { background: 'transparent', color: 'var(--app-muted)', border: '1px solid transparent' },
  danger: { background: 'var(--app-danger-soft)', color: 'var(--app-danger)', border: '1px solid var(--app-danger)' },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'sm', icon, block, style, children, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      {...props}
      style={{
        ...buttonVariants[variant],
        borderRadius: 'var(--radius-md)',
        padding: size === 'sm' ? '4px 10px' : '7px 14px',
        fontSize: size === 'sm' ? 'var(--font-sm)' : 'var(--font-md)',
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-1)',
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        opacity: props.disabled ? 0.5 : 1,
        width: block ? '100%' : undefined,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Texto do tooltip e do leitor de tela — obrigatório em botões só com ícone. */
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  tone?: Tone;
  bordered?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, active, tone, bordered = false, style, type = 'button', ...props },
  ref,
) {
  const colors = tone ? toneColors[tone] : null;
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active}
      {...props}
      style={{
        background: active ? ACCENT_SOFT : 'transparent',
        border: `1px solid ${active ? ACCENT_BORDER : bordered ? 'var(--app-border)' : 'transparent'}`,
        borderRadius: 'var(--radius-md)',
        color: colors?.color ?? (active ? ACCENT : 'var(--app-muted)'),
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        opacity: props.disabled ? 0.5 : 1,
        padding: '3px 5px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...style,
      }}
    >
      {icon}
    </button>
  );
});

/**
 * Ação destrutiva em dois cliques: o primeiro arma ("Confirmar?"), o segundo executa.
 * Desarma sozinho após 4 s.
 */
export function ConfirmButton({
  label,
  confirmLabel = 'Confirmar?',
  icon,
  iconOnly,
  onConfirm,
  disabled,
  style,
}: {
  label: string;
  confirmLabel?: string;
  icon?: React.ReactNode;
  iconOnly?: boolean;
  onConfirm: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (timer.current) clearTimeout(timer.current);
    if (!armed) {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), 4000);
      return;
    }
    setArmed(false);
    onConfirm();
  };

  const text = armed ? confirmLabel : label;
  if (iconOnly && !armed) {
    return <IconButton label={label} icon={icon} onClick={handleClick} disabled={disabled} style={style} />;
  }
  return (
    <Button
      variant={armed ? 'danger' : 'ghost'}
      icon={icon}
      onClick={handleClick}
      disabled={disabled}
      title={armed ? `Clique de novo para ${label.toLowerCase()}` : label}
      aria-label={armed ? `${confirmLabel} (${label})` : label}
      style={{ padding: '2px 6px', ...style }}
    >
      {text}
    </Button>
  );
}

// ── Campos ───────────────────────────────────────────────────────────────────

const fieldStyle: React.CSSProperties = {
  background: 'var(--app-input)',
  border: '1px solid var(--app-border)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--app-text)',
  fontSize: 'var(--font-md)',
  padding: '5px 8px',
  outline: 'none',
  minWidth: 0,
  boxSizing: 'border-box',
};

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ style, ...props }, ref) {
  return <input ref={ref} {...props} style={{ ...fieldStyle, ...style }} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ style, ...props }, ref) {
  return <textarea ref={ref} {...props} style={{ ...fieldStyle, fontFamily: 'inherit', resize: 'none', ...style }} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ style, ...props }, ref) {
  return <select ref={ref} {...props} style={{ ...fieldStyle, padding: '4px 6px', cursor: 'pointer', ...style }} />;
});

/** Rótulo pequeno acima de um campo, associado a ele pelo `htmlFor`. */
export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} style={{ display: 'block', fontSize: 'var(--font-xs)', color: 'var(--app-muted)', marginBottom: '3px' }}>
      {children}
    </label>
  );
}

// ── Navegação ────────────────────────────────────────────────────────────────

export interface SegmentOption<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  count?: number;
  title?: string;
}

/**
 * Abas/filtros em pílula. Nunca transborda: se os rótulos não couberem, as opções
 * com ícone passam a mostrar só o ícone (o nome fica na dica e no leitor de tela)
 * e os textos restantes ganham reticências. `compact` força o modo só-ícone.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  compact,
  disabled,
  ariaLabel,
  stretch,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  compact?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  stretch?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Largura que os rótulos completos ocupam (medida enquanto estão visíveis).
  const fullWidthRef = useRef(0);
  const [autoCompact, setAutoCompact] = useState(false);
  const hasIcons = options.some((option) => option.icon);
  const isCompact = compact || autoCompact;

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element || compact || !hasIcons || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      if (!autoCompact) {
        // Largura natural de cada botão: o conteúdo inteiro (o scrollWidth do rótulo
        // ignora as reticências) + espaçamento interno. Medir o botão em si não serve
        // com `stretch`, porque ele já ocupa o espaço que sobrou.
        const buttons = Array.from(element.children) as HTMLElement[];
        fullWidthRef.current =
          buttons.reduce((sum, button) => {
            const parts = Array.from(button.children) as HTMLElement[];
            const content = parts.reduce((width, part) => width + part.scrollWidth, 0) + Math.max(0, parts.length - 1) * 4;
            return sum + content + 16;
          }, 0) +
          (buttons.length - 1) * 2 +
          6;
      }
      // Largura disponível: a do próprio controle (stretch) ou a do pai.
      const available = stretch ? element.clientWidth : (element.parentElement?.clientWidth ?? element.clientWidth);
      const next = fullWidthRef.current > available + 1;
      if (next !== autoCompact) setAutoCompact(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.parentElement) observer.observe(element.parentElement);
    return () => observer.disconnect();
  }, [compact, hasIcons, autoCompact, stretch, options.length]);

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        gap: '2px',
        background: 'var(--app-surface-muted)',
        padding: '2px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--app-border)',
        // Nunca encolhe no eixo do pai (em colunas isso achataria a altura);
        // a largura é limitada por width/maxWidth e os botões encolhem por dentro.
        flexShrink: 0,
        width: stretch ? '100%' : undefined,
        minWidth: 0,
        maxWidth: '100%',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {options.map((option) => {
        const selected = option.id === value;
        const showLabel = !isCompact || !option.icon;
        const text = compact && !option.icon ? option.label.slice(0, 3) : option.label;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            aria-label={option.label}
            title={option.title ?? option.label}
            disabled={disabled && !selected}
            onClick={() => onChange(option.id)}
            style={{
              flex: stretch ? '1 1 0' : '0 1 auto',
              minWidth: 0,
              background: selected ? ACCENT_STRONG : 'transparent',
              color: selected ? 'var(--app-on-accent)' : 'var(--app-muted)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '3px 8px',
              fontSize: 'var(--font-sm)',
              fontWeight: 600,
              cursor: disabled && !selected ? 'not-allowed' : 'pointer',
              opacity: disabled && !selected ? 0.5 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
          >
            {option.icon && <span style={{ display: 'inline-flex', flexShrink: 0 }}>{option.icon}</span>}
            {showLabel && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{text}</span>}
            {option.count !== undefined && <span style={{ opacity: 0.75, flexShrink: 0 }}>{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Linha de controles: itens à esquerda, `<Spacer />` empurra o resto para a direita. */
export function Toolbar({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0, minWidth: 0, ...style }}>{children}</div>;
}

export function Spacer() {
  return <div style={{ flex: 1 }} />;
}

// ── Conteúdo ─────────────────────────────────────────────────────────────────

export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  const colors = toneColors[tone];
  return (
    <span
      title={title}
      style={{
        fontSize: '9px',
        fontWeight: 700,
        padding: '1px 5px',
        borderRadius: 'var(--radius-sm)',
        flexShrink: 0,
        background: colors.soft,
        color: colors.color,
        border: `1px solid ${colors.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

/** Cartão de uma linha de lista (tarefa, arquivo, snippet…). */
export function ListItem({
  children,
  onClick,
  highlight,
  style,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { highlight?: Tone }) {
  return (
    <div
      {...rest}
      onClick={onClick}
      style={{
        background: 'var(--app-surface-muted)',
        border: `1px solid ${highlight ? toneColors[highlight].border : 'var(--app-border)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: '6px 8px',
        cursor: onClick ? 'pointer' : undefined,
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon?: React.ReactNode; title: string; hint?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 'var(--space-1)',
        color: 'var(--app-muted)',
        fontSize: 'var(--font-md)',
        padding: 'var(--space-4)',
        flex: 1,
      }}
    >
      {icon && <span style={{ color: 'var(--app-muted-strong)', display: 'flex' }}>{icon}</span>}
      <span>{title}</span>
      {hint && <span style={{ fontSize: 'var(--font-sm)', color: 'var(--app-muted-strong)' }}>{hint}</span>}
    </div>
  );
}

const bannerIcons: Partial<Record<Tone, React.ReactNode>> = {
  danger: <AlertCircle size={13} />,
  warning: <TriangleAlert size={13} />,
  accent: <Info size={13} />,
};

export function Banner({
  tone = 'danger',
  icon,
  children,
  onClose,
  action,
}: {
  tone?: Tone;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClose?: () => void;
  action?: React.ReactNode;
}) {
  const colors = toneColors[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        background: colors.soft,
        color: colors.color,
        border: `1px solid ${colors.border}`,
        borderRadius: 'var(--radius-lg)',
        padding: '6px 8px',
        fontSize: 'var(--font-sm)',
        flexShrink: 0,
      }}
    >
      <span style={{ display: 'flex', flexShrink: 0 }}>{icon ?? bannerIcons[tone]}</span>
      <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>{children}</span>
      {action}
      {onClose && <IconButton label="Fechar aviso" icon={<X size={12} />} onClick={onClose} style={{ color: 'inherit', padding: 0 }} />}
    </div>
  );
}

/** Aviso padrão dos widgets que dependem do agente local. */
export function AgentOfflineBanner({ what }: { what: string }) {
  return (
    <Banner tone="danger" icon={<WifiOff size={13} />}>
      O Agent não está disponível. Inicie o serviço local para {what}.
    </Banner>
  );
}
