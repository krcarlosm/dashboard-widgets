// IndexedDB em memória para o Dexie e matchers do jest-dom (toBeInTheDocument etc.).
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
});

// APIs de navegador que o jsdom não implementa.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

if (!('ResizeObserver' in window)) {
  (window as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:teste';
  URL.revokeObjectURL = () => {};
}

// Web Workers não existem no jsdom. O Timer usa um worker só para "acordar" a
// cada segundo; este dublê usa setInterval, que os fake timers controlam.
if (!('Worker' in window)) {
  (window as any).Worker = class {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;
    postMessage(message: unknown) {
      if (this.timer) clearInterval(this.timer);
      this.timer = message === 'start' ? setInterval(() => this.onmessage?.({ data: 'tick' }), 1000) : null;
    }
    terminate() {
      if (this.timer) clearInterval(this.timer);
    }
  };
}
