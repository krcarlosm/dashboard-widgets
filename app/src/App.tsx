import React, { useEffect } from 'react';
import { useDashboardStore } from './store/dashboardStore';
import { helloWorldWidget } from './widgets/hello-world';
import { notesWidget } from './widgets/notes';
import { pomodoroWidget } from './widgets/pomodoro';
import { todoWidget } from './widgets/todo';
import { noiseWidget } from './widgets/noise';
import { snippetsWidget } from './widgets/snippets';
import { unitConverterWidget } from './widgets/unit-converter';
import { dateCalculatorWidget } from './widgets/date-calculator';
import { ruleOfThreeWidget } from './widgets/rule-of-three';
import { memoryBauWidget } from './widgets/memory-bau';
import { editedFilesWidget } from './widgets/edited-files';
import { kanbanWidget } from './widgets/kanban';
import { Sidebar } from './components/Sidebar';
import { Canvas } from './components/Canvas';

export const App: React.FC = () => {
  const registerWidget = useDashboardStore((state) => state.registerWidget);
  const loadProfile = useDashboardStore((state) => state.loadProfile);
  const theme = useDashboardStore((state) => state.theme);
  const density = useDashboardStore((state) => state.density);
  const accentColor = useDashboardStore((state) => state.accentColor);

  // Mapa de cores de destaque principais. Ajuste aqui para alterar o tema de acento do aplicativo.
  const accentMap = {
    sky: '#38bdf8',
    violet: '#8b5cf6',
    emerald: '#34d399',
  } as const;

  // Variáveis CSS base usadas em todo o app. Aqui você define superfície, bordas e cores de texto.
  // Cada valor muda automaticamente entre o modo claro e escuro.
  const appearanceStyle = {
    ['--app-accent' as string]: accentMap[accentColor],
    ['--app-surface' as string]: theme === 'light' ? '#ffffff' : '#0f172a',
    ['--app-surface-muted' as string]: theme === 'light' ? '#f1f5f9' : '#111827',
    ['--app-border' as string]: theme === 'light' ? '#cbd5e1' : '#334155',
    ['--app-text' as string]: theme === 'light' ? '#0f172a' : '#f8fafc',
    ['--app-muted' as string]: theme === 'light' ? '#475569' : '#94a3b8',
  } as React.CSSProperties;

  useEffect(() => {
    // ── Phase 1 widgets ──────────────────────────────────────────────────────
    registerWidget(helloWorldWidget);

    // ── Phase 2 MVP widgets ──────────────────────────────────────────────────
    registerWidget(notesWidget);
    registerWidget(pomodoroWidget);       // Now: Timer Multiferramenta (v2)
    registerWidget(todoWidget);
    registerWidget(noiseWidget);
    registerWidget(kanbanWidget);

    // ── Phase 2 new widgets ──────────────────────────────────────────────────
    registerWidget(snippetsWidget);       // Item 12
    registerWidget(unitConverterWidget);  // Item 9a
    registerWidget(dateCalculatorWidget); // Item 9b
    registerWidget(ruleOfThreeWidget);    // Item 9c

    // ── Phase 4 agent-dependent widgets ─────────────────────────────────────
    registerWidget(memoryBauWidget);
    registerWidget(editedFilesWidget);

    // ── Load saved profile ───────────────────────────────────────────────────
    loadProfile();
  }, [registerWidget, loadProfile]);

  return (
    <div
      style={{
        display: 'flex',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: theme === 'light' ? '#f8fafc' : 'radial-gradient(circle at top, #1e293b 0%, #0f172a 100%)',
        color: 'var(--app-text)',
        ...appearanceStyle,
      }}
    >
      <Sidebar />
      <Canvas />
    </div>
  );
};

export default App;
