import React from 'react';
import { useDashboardStore } from '../store/dashboardStore';
import { Plus, LayoutGrid, Activity, Sparkles } from 'lucide-react';

export const Sidebar: React.FC = () => {
  const registeredWidgets = useDashboardStore((state) => state.registeredWidgets);
  const addWidgetToCanvas = useDashboardStore((state) => state.addWidgetToCanvas);

  const widgetsList = Array.from(registeredWidgets.values());

  return (
    <aside
      style={{
        width: '260px',
        background: 'rgba(15, 23, 42, 0.95)',
        borderRight: '1px solid rgba(51, 65, 85, 0.6)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        boxSizing: 'border-box',
        backdropFilter: 'blur(16px)',
        zIndex: 10,
      }}
    >
      {/* Sidebar Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(51, 65, 85, 0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <div style={{
          background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(56, 189, 248, 0.3)'
        }}>
          <LayoutGrid size={18} color="#ffffff" />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#f8fafc' }}>Dashboard</h1>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Widgets Locais v0.1</span>
        </div>
      </div>

      {/* Widget List Section */}
      <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
        <div style={{
          fontSize: '11px',
          fontWeight: 700,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <Sparkles size={12} color="#38bdf8" />
          <span>Widgets Disponíveis</span>
        </div>

        {widgetsList.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', marginTop: '20px' }}>
            Nenhum widget registrado.
          </div>
        ) : (
          widgetsList.map((item) => (
            <div
              key={item.manifest.id}
              style={{
                background: 'rgba(30, 41, 59, 0.5)',
                border: '1px solid rgba(51, 65, 85, 0.5)',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '10px',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>
                  {item.manifest.name}
                </span>
                <button
                  onClick={() => addWidgetToCanvas(item.manifest.id)}
                  title="Adicionar ao canvas"
                  style={{
                    background: '#0284c7',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#ffffff',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    fontWeight: 500,
                  }}
                >
                  <Plus size={13} />
                  <span>Adicionar</span>
                </button>
              </div>
              <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', lineHeight: '1.4' }}>
                {item.manifest.description}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Footer Info */}
      <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(51, 65, 85, 0.5)', fontSize: '11px', color: '#64748b' }}>
        Fase 0 — Validação do Core SDK
      </div>
    </aside>
  );
};
