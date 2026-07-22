import React, { useEffect } from 'react';
import { useDashboardStore } from './store/dashboardStore';
import { helloWorldWidget } from './widgets/hello-world';
import { Sidebar } from './components/Sidebar';
import { Canvas } from './components/Canvas';

export const App: React.FC = () => {
  const registerWidget = useDashboardStore((state) => state.registerWidget);
  const loadProfile = useDashboardStore((state) => state.loadProfile);

  useEffect(() => {
    // Registrar widgets do sistema
    registerWidget(helloWorldWidget);

    // Carregar perfil salvo do usuário
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
