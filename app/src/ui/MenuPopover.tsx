import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Menu flutuante preso a um botão. Renderizado no <body>, porque o card do widget
// corta o que transborda. Fecha com Esc, clique fora ou redimensionando a janela;
// setas ↑/↓ andam entre os itens (`role="menuitem"`).

export function MenuPopover({
  anchorRef,
  open,
  onClose,
  label,
  width = 220,
  children,
}: {
  anchorRef: React.RefObject<HTMLElement>;
  open: boolean;
  onClose: () => void;
  label: string;
  width?: number;
  children: React.ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPosition(null);
      return;
    }
    const rect = anchorRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    const below = rect.bottom + 4;
    const fitsBelow = below + menuHeight <= window.innerHeight - 8;
    const top = !fitsBelow && rect.top - menuHeight - 4 > 8 ? rect.top - menuHeight - 4 : below;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    setPosition({ top, left });
  }, [open, anchorRef, width, children]);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node) || anchorRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onResize = () => onClose();
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [open, onClose, anchorRef]);

  useEffect(() => {
    if (open && position) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open, position]);

  if (!open) return null;
  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
        if (!items.length) return;
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next = event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
        items[next].focus();
      }}
      style={{
        position: 'fixed',
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        width: `${width}px`,
        maxHeight: '320px',
        overflowY: 'auto',
        zIndex: 2500,
        background: 'var(--app-surface)',
        color: 'var(--app-text)',
        border: '1px solid var(--app-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-card)',
        padding: '4px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        fontSize: 'var(--font-md)',
      }}
    >
      <div style={{ padding: '4px 8px', fontSize: 'var(--font-xs)', color: 'var(--app-muted)', fontWeight: 600 }}>{label}</div>
      {children}
    </div>,
    document.body,
  );
}

/** Item clicável do menu. */
export function MenuItem({ children, onSelect, title }: { children: React.ReactNode; onSelect: () => void; title?: string }) {
  return (
    <button
      type="button"
      role="menuitem"
      title={title}
      onClick={onSelect}
      style={{
        textAlign: 'left',
        background: 'transparent',
        border: 'none',
        borderRadius: 'var(--radius-md)',
        color: 'var(--app-text)',
        padding: '6px 8px',
        cursor: 'pointer',
        fontSize: 'var(--font-md)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
      onMouseEnter={(event) => (event.currentTarget.style.background = 'var(--app-surface-elevated)')}
      onMouseLeave={(event) => (event.currentTarget.style.background = 'transparent')}
      onFocus={(event) => (event.currentTarget.style.background = 'var(--app-surface-elevated)')}
      onBlur={(event) => (event.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  );
}

/** Texto informativo dentro do menu (vazio, carregando…). */
export function MenuNote({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '6px 8px', color: 'var(--app-muted)', fontSize: 'var(--font-sm)' }}>{children}</div>;
}
