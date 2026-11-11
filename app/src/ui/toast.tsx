import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { CheckCircle2, AlertCircle } from 'lucide-react';

// Avisos curtos no canto da tela (ex.: "Enviado para Anotações.").
//   showToast('Enviado para Anotações.');
//   showToast('Não foi possível enviar.', 'danger');

type ToastTone = 'success' | 'danger';

interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
}

const DURATION_MS = 3500;
let items: ToastItem[] = [];
let nextId = 1;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

function render() {
  if (!host || !document.body.contains(host)) {
    host = document.createElement('div');
    host.setAttribute('data-toasts', '');
    document.body.appendChild(host);
    root = createRoot(host);
  }
  root!.render(
    <div style={{ position: 'fixed', right: '16px', bottom: '16px', zIndex: 3000, display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end', pointerEvents: 'none' }}>
      {items.map((item) => (
        <div
          key={item.id}
          role={item.tone === 'danger' ? 'alert' : 'status'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            maxWidth: '360px',
            background: 'var(--app-surface, #1e293b)',
            color: 'var(--app-text, #e2e8f0)',
            border: `1px solid ${item.tone === 'danger' ? 'var(--app-danger, #f87171)' : 'var(--app-success, #34d399)'}`,
            borderRadius: 'var(--radius-lg, 8px)',
            boxShadow: 'var(--shadow-card, 0 8px 24px rgba(0,0,0,0.4))',
            padding: '8px 12px',
            fontSize: 'var(--font-md, 12px)',
          }}
        >
          {item.tone === 'danger' ? <AlertCircle size={14} color="var(--app-danger)" /> : <CheckCircle2 size={14} color="var(--app-success)" />}
          <span>{item.text}</span>
        </div>
      ))}
    </div>,
  );
}

export function showToast(text: string, tone: ToastTone = 'success') {
  const item = { id: nextId++, text, tone };
  items = [...items.slice(-3), item];
  render();
  setTimeout(() => {
    items = items.filter((entry) => entry.id !== item.id);
    render();
  }, DURATION_MS);
}

/** Usado pelos testes para começar sem avisos antigos. */
export function clearToasts() {
  items = [];
  if (root && host && document.body.contains(host)) render();
}
