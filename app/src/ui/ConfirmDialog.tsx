import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { TriangleAlert } from 'lucide-react';
import { Button } from './index';

// Diálogo de confirmação no visual do app (substitui window.confirm).
//   if (await confirmDialog({ title: 'Restaurar?', message: '…' })) { … }
// Esc ou clique fora cancelam; Enter confirma.

export interface ConfirmOptions {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'accent';
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  onResult,
}: ConfirmOptions & { onResult: (confirmed: boolean) => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onResult(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onResult]);

  return (
    <div
      onClick={() => onResult(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '400px',
          maxWidth: '100%',
          background: 'var(--app-surface)',
          color: 'var(--app-text)',
          border: '1px solid var(--app-border)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-card)',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {tone === 'danger' && <TriangleAlert size={16} color="var(--app-danger)" />}
          <h2 id="confirm-dialog-title" style={{ margin: 0, fontSize: 'var(--font-lg)', fontWeight: 700 }}>{title}</h2>
        </div>
        <div style={{ fontSize: 'var(--font-md)', color: 'var(--app-muted)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{message}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Button onClick={() => onResult(false)} size="md">{cancelLabel}</Button>
          <Button ref={confirmRef} onClick={() => onResult(true)} variant={tone === 'danger' ? 'danger' : 'primary'} size="md">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const finish = (confirmed: boolean) => {
      root.unmount();
      host.remove();
      resolve(confirmed);
    };
    root.render(<ConfirmDialog {...options} onResult={finish} />);
  });
}
