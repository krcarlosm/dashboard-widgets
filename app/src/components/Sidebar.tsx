import React, { useState } from 'react';
import { useDashboardStore } from '../store/dashboardStore';
import { Plus, LayoutGrid, Sparkles, Search, User, Check, Wrench } from 'lucide-react';
import { ProfileModal } from './ProfileModal';

export const Sidebar: React.FC = () => {
  const registeredWidgets = useDashboardStore((state) => state.registeredWidgets);
  const activeInstances = useDashboardStore((state) => state.activeInstances);
  const addWidgetToCanvas = useDashboardStore((state) => state.addWidgetToCanvas);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);

  const widgetsList = Array.from(registeredWidgets.values()).filter(
    (item) => item.manifest.status !== 'deprecated'
  );

  const filteredWidgets = widgetsList.filter((item) => {
    const term = searchTerm.toLowerCase();
    return (
      item.manifest.name.toLowerCase().includes(term) ||
      item.manifest.description.toLowerCase().includes(term)
    );
  });

  const activeWidgetIds = new Set(activeInstances.map((i) => i.widgetId));

  return (
    <>
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
            padding: '16px',
            borderBottom: '1px solid rgba(51, 65, 85, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(56, 189, 248, 0.3)',
              }}
            >
              <LayoutGrid size={18} color="#ffffff" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>Dashboard</h1>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Widgets Locais v0.2</span>
            </div>
          </div>

          <button
            onClick={() => setIsProfileOpen(true)}
            title="Meu Perfil"
            style={{
              background: 'rgba(51, 65, 85, 0.5)',
              border: 'none',
              borderRadius: '6px',
              color: '#94a3b8',
              width: '30px',
              height: '30px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#38bdf8';
              e.currentTarget.style.background = 'rgba(56, 189, 248, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#94a3b8';
              e.currentTarget.style.background = 'rgba(51, 65, 85, 0.5)';
            }}
          >
            <User size={16} />
          </button>
        </div>

        {/* Search Bar */}
        <div style={{ padding: '12px 16px 4px 16px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '6px 10px',
            }}
          >
            <Search size={13} color="#64748b" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar widgets..."
              style={{
                background: 'transparent',
                border: 'none',
                color: '#f8fafc',
                fontSize: '11px',
                outline: 'none',
                width: '100%',
              }}
            />
          </div>
        </div>

        {/* Widget List Section */}
        <div style={{ flex: 1, padding: '12px 16px', overflowY: 'auto' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Sparkles size={12} color="#38bdf8" />
            <span>Widgets Disponíveis ({filteredWidgets.length})</span>
          </div>

          {filteredWidgets.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', marginTop: '20px' }}>
              Nenhum widget encontrado.
            </div>
          ) : (
            filteredWidgets.map((item) => {
              const isAdded = activeWidgetIds.has(item.manifest.id);
              const status = item.manifest.status || 'stable';

              return (
                <div
                  key={item.manifest.id}
                  style={{
                    background: 'rgba(30, 41, 59, 0.5)',
                    border: '1px solid rgba(51, 65, 85, 0.5)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    marginBottom: '10px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>
                        {item.manifest.name}
                      </span>
                      {status === 'in_development' && (
                        <span
                          title="Em Desenvolvimento"
                          style={{ fontSize: '9px', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.4)', padding: '0 4px', borderRadius: '3px' }}
                        >
                          Dev
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => addWidgetToCanvas(item.manifest.id)}
                      title="Adicionar ao canvas"
                      style={{
                        background: isAdded ? 'rgba(51, 65, 85, 0.6)' : '#0284c7',
                        border: 'none',
                        borderRadius: '4px',
                        color: isAdded ? '#38bdf8' : '#ffffff',
                        padding: '4px 8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '10px',
                        fontWeight: 500,
                      }}
                    >
                      {isAdded ? (
                        <>
                          <Check size={12} />
                          <span>Adicionado</span>
                        </>
                      ) : (
                        <>
                          <Plus size={12} />
                          <span>Adicionar</span>
                        </>
                      )}
                    </button>
                  </div>

                  <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', lineHeight: '1.4' }}>
                    {item.manifest.description}
                  </p>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Info */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(51, 65, 85, 0.5)', fontSize: '11px', color: '#64748b' }}>
          Fase 2 — Widgets MVP (Local-First)
        </div>
      </aside>

      <ProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
    </>
  );
};
