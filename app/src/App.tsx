import React, { useEffect, useMemo } from 'react';
import { buildActionTargets, useDashboardStore } from './store/dashboardStore';
import { actionBus } from './sdk/actions';
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
import { fileConverterWidget } from './widgets/file-converter';
import { mediaDownloaderWidget } from './widgets/media-downloader';

import { Sidebar } from './components/Sidebar';
import { Canvas } from './components/Canvas';
import { defaultAgentClient } from './sdk/agentClient';
import { startAutoBackupScheduler } from './sdk/autoBackup';
import { buildAppearanceStyle } from './theme/tokens';

export const App: React.FC = () => {
  const registerWidget = useDashboardStore((state) => state.registerWidget);
  const loadProfile = useDashboardStore((state) => state.loadProfile);
  const theme = useDashboardStore((state) => state.theme);
  const density = useDashboardStore((state) => state.density);
  const accentColor = useDashboardStore((state) => state.accentColor);

  // Cores, tamanhos e densidade vêm dos tokens (src/theme/tokens.ts).
  const appearanceStyle = useMemo(() => buildAppearanceStyle({ theme, density, accentColor }), [theme, density, accentColor]);

  useEffect(() => {
    
    registerWidget(helloWorldWidget);
    registerWidget(notesWidget);
    registerWidget(pomodoroWidget);       // Now: Timer Multiferramenta (v2)
    registerWidget(todoWidget);
    registerWidget(noiseWidget);
    registerWidget(kanbanWidget);
    registerWidget(snippetsWidget);       // Item 12
    registerWidget(unitConverterWidget);  // Item 9a
    registerWidget(dateCalculatorWidget); // Item 9b
    registerWidget(ruleOfThreeWidget);    // Item 9c
	
	
    // Agent-dependent widgets ─────────────────────────────────────
    registerWidget(memoryBauWidget);
    registerWidget(editedFilesWidget);
    registerWidget(fileConverterWidget);
    registerWidget(mediaDownloaderWidget);

    // ── Load saved profile ───────────────────────────────────────────────────
    loadProfile();
  }, [registerWidget, loadProfile]);

  // Os tokens também ficam no <html>: diálogos e portais renderizados fora
  // desta árvore (ex.: confirmDialog) usam as mesmas cores.
  useEffect(() => {
    const root = document.documentElement;
    Object.entries(appearanceStyle).forEach(([name, value]) => root.style.setProperty(name, String(value)));
    root.style.colorScheme = theme;
  }, [appearanceStyle, theme]);

  // "Enviar para…": os destinos são as instâncias atuais do canvas.
  useEffect(() => actionBus.setTargetsProvider(() => buildActionTargets(useDashboardStore.getState())), []);

  // Backup automático diário (horário configurável no perfil; padrão 16:30).
  useEffect(() => startAutoBackupScheduler(defaultAgentClient), []);

  return (
    <div
      style={{
        display: 'flex',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: theme === 'light' ? 'var(--app-bg)' : 'radial-gradient(circle at top, #1e293b 0%, #0f172a 100%)',
        color: 'var(--app-text)',
        colorScheme: theme,
        ...appearanceStyle,
      }}
    >
      <Sidebar />
      <Canvas />
    </div>
  );
};

export default App;
