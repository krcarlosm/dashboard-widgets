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
import { Sidebar } from './components/Sidebar';
import { Canvas } from './components/Canvas';

export const App: React.FC = () => {
  const registerWidget = useDashboardStore((state) => state.registerWidget);
  const loadProfile = useDashboardStore((state) => state.loadProfile);

  useEffect(() => {
    // ── Phase 1 widgets ──────────────────────────────────────────────────────
    registerWidget(helloWorldWidget);

    // ── Phase 2 MVP widgets ──────────────────────────────────────────────────
    registerWidget(notesWidget);
    registerWidget(pomodoroWidget);       // Now: Timer Multiferramenta (v2)
    registerWidget(todoWidget);
    registerWidget(noiseWidget);

    // ── Phase 2 new widgets ──────────────────────────────────────────────────
    registerWidget(snippetsWidget);       // Item 12
    registerWidget(unitConverterWidget);  // Item 9a
    registerWidget(dateCalculatorWidget); // Item 9b
    registerWidget(ruleOfThreeWidget);    // Item 9c

    // ── Load saved profile ───────────────────────────────────────────────────
    loadProfile();
  }, [registerWidget, loadProfile]);

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <Canvas />
    </div>
  );
};

export default App;
