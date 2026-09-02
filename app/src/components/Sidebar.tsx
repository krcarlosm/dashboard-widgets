import React, { useEffect, useState } from 'react';
import { useDashboardStore } from '../store/dashboardStore';
import { defaultAgentClient } from '../sdk/agentClient';
import { Plus, LayoutGrid, Sparkles, Search, User, Wrench, ChevronLeft, PanelLeft, Menu, FileText, CheckSquare, Clock3, Radio, Calculator, Code2, ArrowRightLeft, Divide, CalendarRange, Sparkles as SparklesIcon, RotateCcw, Bot, CheckCircle2, AlertCircle } from 'lucide-react';
import { ProfileModal } from './ProfileModal';

type SidebarState = 'expanded' | 'compact' | 'collapsed';

export const Sidebar: React.FC = () => {
  const registeredWidgets = useDashboardStore((state) => state.registeredWidgets);
  const activeInstances = useDashboardStore((state) => state.activeInstances);
  const addWidgetToCanvas = useDashboardStore((state) => state.addWidgetToCanvas);
  const reorganizeLayouts = useDashboardStore((state) => state.reorganizeLayouts);
  const resetDashboard = useDashboardStore((state) => state.resetDashboard);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const [sidebarState, setSidebarState] = useState<SidebarState>('expanded');
  const [agentStatus, setAgentStatus] = useState<'checking' | 'online' | 'offline'>('offline');
  const [agentMessage, setAgentMessage] = useState<string>('Agent ainda não verificado');

  const widgetsList = Array.from(registeredWidgets.values()).filter(
    (item) => item.manifest.status !== 'deprecated'
  );

  const iconMap: Record<string, React.ReactNode> = {
    Activity: <SparklesIcon size={16} />,
    FileText: <FileText size={16} />,
    CheckSquare: <CheckSquare size={16} />,
    Clock3: <Clock3 size={16} />,
    Radio: <Radio size={16} />,
    Calculator: <Calculator size={16} />,
    Code2: <Code2 size={16} />,
    ArrowRightLeft: <ArrowRightLeft size={16} />,
    Divide: <Divide size={16} />,
    Calendar: <CalendarRange size={16} />,
    Kanban: <CheckSquare size={16} />,
    Camera: <Bot size={16} />,
    FolderOpen: <Bot size={16} />,
  };

  const filteredWidgets = widgetsList.filter((item) => {
    const term = searchTerm.toLowerCase();
    return (
      item.manifest.name.toLowerCase().includes(term) ||
      item.manifest.description.toLowerCase().includes(term)
    );
  });

  // Map: widgetId -> count of active instances
  const instanceCountMap: Record<string, number> = {};
  for (const inst of activeInstances) {
    instanceCountMap[inst.widgetId] = (instanceCountMap[inst.widgetId] || 0) + 1;
  }

  const totalActiveWidgets = activeInstances.length;

  useEffect(() => {
    const unsubscribe = defaultAgentClient.onStatusChange((connected) => {
      setAgentStatus(connected ? 'online' : 'offline');
      setAgentMessage(connected ? 'Agent respondendo corretamente' : 'Agent indisponível');
    });
    return unsubscribe;
  }, []);

  const handleReorganize = () => {
    reorganizeLayouts();
  };

  const handleViewAll = () => {
    window.dispatchEvent(new CustomEvent('dashboard:view-all'));
  };

  const handleVerifyAgent = async () => {
    setAgentStatus('checking');
    setAgentMessage('Verificando Agent...');
    const ok = await defaultAgentClient.checkHealth();
    setAgentStatus(ok ? 'online' : 'offline');
    setAgentMessage(ok ? 'Agent respondeu corretamente' : 'Agent não respondeu ao handshake');
  };

  const cycleSidebar = () => {
    setSidebarState((prev) => {
      if (prev === 'expanded') return 'compact';
      if (prev === 'compact') return 'collapsed';
      return 'expanded';
    });
  };

  const sidebarWidth =
    sidebarState === 'expanded' ? '260px' : sidebarState === 'compact' ? '62px' : '0px';

  return (
    <>
      {/* Floating open button when collapsed */}
      {sidebarState === 'collapsed' && (
        <button
          onClick={() => setSidebarState('expanded')}
          title="Abrir menu lateral"
          style={{
            position: 'fixed',
            top: '16px',
            left: '16px',
            zIndex: 100,
            width: '40px',
            height: '40px',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid var(--app-accent-border)',
            borderRadius: '10px',
            color: 'var(--app-accent)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            backdropFilter: 'blur(10px)',
            transition: 'all 0.2s',
          }}
        >
          <Menu size={18} />
        </button>
      )}

      <aside
        style={{
          width: sidebarWidth,
          minWidth: sidebarWidth,
          background: 'var(--app-surface)',
          borderRight: sidebarState === 'collapsed' ? 'none' : '1px solid var(--app-border)',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          boxSizing: 'border-box',
          backdropFilter: 'blur(16px)',
          zIndex: 10,
          overflow: 'hidden',
          transition: 'width 0.25s ease, min-width 0.25s ease',
        }}
      >
        {/* Sidebar Header */}
        <div
          style={{
            padding: sidebarState === 'compact' ? '12px 8px' : '14px 14px',
            borderBottom: '1px solid var(--app-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: sidebarState === 'compact' ? 'center' : 'space-between',
            flexShrink: 0,
          }}
        >
          {sidebarState === 'expanded' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '50px', minWidth: 0 }}>
              <div
                style={{
                  background: 'linear-gradient(135deg, var(--app-accent-strong), var(--app-accent))',
                  width: '30px',
                  height: '30px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px var(--app-accent-border)',
                  flexShrink: 0,
                }}
              >
                <LayoutGrid size={16} color="#ffffff" />
              </div>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#f8fafc', whiteSpace: 'nowrap' }}>
                  Dashboard
                </h1>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>Widgets Locais v0.3</span>
              </div>
            </div>
          )}

          {sidebarState === 'compact' && (
            <div
              style={{
                background: 'linear-gradient(135deg, var(--app-accent-strong), var(--app-accent))',
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LayoutGrid size={16} color="#ffffff" />
            </div>
          )}

          {/* Collapse toggle (shown in expanded and compact) */}
          <button
            onClick={cycleSidebar}
            title={
              sidebarState === 'expanded'
                ? 'Modo compacto'
                : sidebarState === 'compact'
                ? 'Recolher sidebar'
                : 'Expandir sidebar'
            }
            style={{
              background: 'rgba(51, 65, 85, 0.4)',
              border: 'none',
              borderRadius: '6px',
              color: '#64748b',
              width: '26px',
              height: '26px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--app-accent)';
              e.currentTarget.style.background = 'var(--app-accent-soft)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#64748b';
              e.currentTarget.style.background = 'rgba(51, 65, 85, 0.4)';
            }}
          >
            {sidebarState === 'expanded' ? (
              <ChevronLeft size={14} />
            ) : (
              <PanelLeft size={50} />
            )}
          </button>
        </div>

        {sidebarState === 'expanded' && (
          <div style={{ display: 'flex', gap: '8px', padding: '10px 14px', borderBottom: '1px solid rgba(51, 65, 85, 0.4)' }}>
            <button
              onClick={handleReorganize}
              style={{
                flex: 1,
                background: 'var(--app-accent-soft)',
                color: 'var(--app-accent)',
                border: '1px solid var(--app-accent-border)',
                borderRadius: '8px',
                padding: '7px 10px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 600,
              }}
            >
              Reorganizar
            </button>
            <button
              onClick={handleViewAll}
              style={{
                flex: 1,
                background: 'rgba(15, 23, 42, 0.8)',
                color: '#f8fafc',
                border: '1px solid rgba(51, 65, 85, 0.5)',
                borderRadius: '8px',
                padding: '7px 10px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 600,
              }}
            >
              Ver tudo
            </button>
          </div>
        )}

        {/* Compact mode: icon-only widget buttons */}
        {sidebarState === 'compact' && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '10px 0',
              gap: '6px',
              overflowY: 'auto',
            }}
          >
            {/* Active counter */}
            <div
              title={`${totalActiveWidgets} widget(s) ativo(s)`}
              style={{
                width: '36px',
                height: '24px',
                background: totalActiveWidgets > 0 ? 'var(--app-accent-soft)' : 'rgba(51, 65, 85, 0.3)',
                border: `1px solid ${totalActiveWidgets > 0 ? 'var(--app-accent-border)' : 'rgba(51, 65, 85, 0.3)'}`,
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
                fontWeight: 700,
                color: totalActiveWidgets > 0 ? 'var(--app-accent)' : '#64748b',
                marginBottom: '4px',
              }}
            >
              {totalActiveWidgets}
            </div>

            {widgetsList.map((item) => {
              const count = instanceCountMap[item.manifest.id] || 0;
              const status = item.manifest.status || 'stable';
              return (
                <div key={item.manifest.id} style={{ position: 'relative' }}>
                  <button
                    onClick={() => addWidgetToCanvas(item.manifest.id)}
                      title="Adicionar"
                    style={{
                      width: '40px',
                      height: '40px',
                      background: count > 0 ? 'rgba(2, 132, 199, 0.15)' : 'rgba(30, 41, 59, 0.6)',
                      border: `1px solid ${count > 0 ? 'rgba(2, 132, 199, 0.4)' : 'rgba(51, 65, 85, 0.5)'}`,
                      borderRadius: '8px',
                      color: status === 'in_development' ? 'var(--app-accent)' : count > 0 ? 'var(--app-accent-strong)' : '#94a3b8',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s',
                      fontSize: '16px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--app-accent)';
                      e.currentTarget.style.background = 'var(--app-accent-soft)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = count > 0 ? 'rgba(2, 132, 199, 0.4)' : 'rgba(51, 65, 85, 0.5)';
                      e.currentTarget.style.background = count > 0 ? 'rgba(2, 132, 199, 0.15)' : 'rgba(30, 41, 59, 0.6)';
                    }}
                      >
                    <span style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {iconMap[item.manifest.icon as string] || item.manifest.name.charAt(0).toUpperCase()}
                    </span>
                  </button>
                  {count > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '-5px',
                        right: '-5px',
                        background: 'var(--app-accent-strong)',
                        color: '#fff',
                        fontSize: '9px',
                        fontWeight: 700,
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {count}
                    </span>
                  )}
                </div>
              );
            })}

            {/* Profile button at bottom in compact mode */}
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button
                onClick={() => resetDashboard()}
                title="Reset global"
                style={{
                  width: '40px',
                  height: '40px',
                  background: 'rgba(248, 113, 113, 0.12)',
                  border: '1px solid rgba(248, 113, 113, 0.28)',
                  borderRadius: '8px',
                  color: '#f87171',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                }}
              >
                <RotateCcw size={16} />
              </button>
              <button
                onClick={() => setIsProfileOpen(true)}
                title="Meu Perfil"
                style={{
                  width: '40px',
                  height: '40px',
                  background: 'rgba(51, 65, 85, 0.4)',
                  border: '1px solid rgba(51, 65, 85, 0.5)',
                  borderRadius: '8px',
                  color: '#64748b',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--app-accent)';
                  e.currentTarget.style.background = 'var(--app-accent-soft)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#64748b';
                  e.currentTarget.style.background = 'rgba(51, 65, 85, 0.4)';
                }}
              >
                <User size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Expanded mode: full sidebar */}
        {sidebarState === 'expanded' && (
          <>
            {/* Agent health status */}
            <div
              style={{
                margin: '10px 14px 0 14px',
                padding: '8px 10px',
                background: agentStatus === 'online'
                  ? 'rgba(34, 197, 94, 0.1)'
                  : agentStatus === 'checking'
                    ? 'var(--app-accent-soft)'
                    : 'rgba(248, 113, 113, 0.12)',
                border: `1px solid ${agentStatus === 'online' ? 'rgba(34, 197, 94, 0.3)' : agentStatus === 'checking' ? 'var(--app-accent-border)' : 'rgba(248, 113, 113, 0.3)'}`,
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '11px',
              }}
            >
              {agentStatus === 'online' ? <CheckCircle2 size={13} color="#4ade80" /> : agentStatus === 'checking' ? <Bot size={13} color="var(--app-accent)" /> : <AlertCircle size={13} color="#fda4af" />}
              <span style={{ color: '#f8fafc' }}>{agentMessage}</span>
            </div>

            {/* Active widgets counter */}
            <div
              style={{
                margin: '10px 14px 0 14px',
                padding: '7px 10px',
                background: totalActiveWidgets > 0
                  ? 'var(--app-accent-soft)'
                  : 'rgba(30, 41, 59, 0.3)',
                border: `1px solid ${totalActiveWidgets > 0 ? 'var(--app-accent-border)' : 'rgba(51, 65, 85, 0.3)'}`,
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11px',
              }}
            >
              <span style={{ color: '#94a3b8' }}>Widgets no canvas</span>
              <span
                style={{
                  fontWeight: 700,
                  color: totalActiveWidgets > 0 ? 'var(--app-accent)' : '#64748b',
                  background: totalActiveWidgets > 0 ? 'var(--app-accent-soft)' : 'transparent',
                  padding: '1px 8px',
                  borderRadius: '10px',
                  minWidth: '24px',
                  textAlign: 'center',
                }}
              >
                {totalActiveWidgets}
              </span>
            </div>

            {/* Search Bar */}
            <div style={{ padding: '10px 14px 4px 14px' }}>
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
            <div style={{ flex: 1, padding: '10px 14px', overflowY: 'auto' }}>
              <button
                onClick={() => resetDashboard()}
                style={{
                  width: '100%',
                  background: 'rgba(248, 113, 113, 0.12)',
                  color: '#f87171',
                  border: '1px solid rgba(248, 113, 113, 0.28)',
                  borderRadius: '8px',
                  padding: '7px 10px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  marginBottom: '10px',
                }}
              >
                <RotateCcw size={13} /> Reset Global
              </button>
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Sparkles size={11} color="var(--app-accent)" />
                <span>Disponíveis ({filteredWidgets.length})</span>
              </div>

              {filteredWidgets.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', marginTop: '20px' }}>
                  Nenhum widget encontrado.
                </div>
              ) : (
                filteredWidgets.map((item) => {
                  const count = instanceCountMap[item.manifest.id] || 0;
                  const status = item.manifest.status || 'stable';

                  return (
                    <div
                      key={item.manifest.id}
                      style={{
                        background: 'rgba(30, 41, 59, 0.5)',
                        border: `1px solid ${count > 0 ? 'rgba(2, 132, 199, 0.3)' : 'rgba(51, 65, 85, 0.5)'}`,
                        borderRadius: '8px',
                        padding: '10px 12px',
                        marginBottom: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {/* Linha 1: Título do app e badges */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9' }}>
                          {item.manifest.name}
                        </span>
                        {status === 'in_development' && (
                          <span
                            title="Em Desenvolvimento"
                            style={{ fontSize: '9px', background: 'var(--app-accent-soft)', color: 'var(--app-accent)', border: '1px solid var(--app-accent-border)', padding: '0 4px', borderRadius: '3px', flexShrink: 0 }}
                          >
                            Dev
                          </span>
                        )}
                        {item.manifest.requiresAgent && (
                          <span
                            title="Requer Agent"
                            style={{ fontSize: '9px', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '0 4px', borderRadius: '3px', flexShrink: 0 }}
                          >
                            Agent
                          </span>
                        )}
                        {status === 'needs_improvement' && (
                          <span
                            title="Necessita Ajustes"
                            style={{ fontSize: '9px', background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.4)', padding: '0 4px', borderRadius: '3px', flexShrink: 0 }}
                          >
                            <Wrench size={8} style={{ verticalAlign: 'middle' }} /> Fix
                          </span>
                        )}
                      </div>

                      {/* Linha 2: Descrição do app */}
                      <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', lineHeight: '1.4' }}>
                        {item.manifest.description}
                      </p>

                      {/* Linha 3: Botão de Adicionar */}
                      <div style={{ marginTop: '2px' }}>
                        <button
                          onClick={() => addWidgetToCanvas(item.manifest.id)}
                          title="Adicionar nova instância ao canvas"
                          style={{
                            width: '100%',
                            background: 'var(--app-accent-strong)',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#ffffff',
                            padding: '5px 10px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            transition: 'background 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#0369a1';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--app-accent-strong)';
                          }}
                        >
                          <Plus size={12} />
                          <span>Adicionar</span>
                          {count > 0 && (
                            <span
                              style={{
                                background: 'rgba(255,255,255,0.25)',
                                borderRadius: '10px',
                                padding: '1px 6px',
                                fontSize: '9px',
                                fontWeight: 700,
                                marginLeft: '4px',
                              }}
                            >
                              {count} ativo(s)
                            </span>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer Info */}
            <div
              style={{
                padding: '10px 14px',
                borderTop: '1px solid rgba(51, 65, 85, 0.5)',
                fontSize: '11px',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>Fase 2 — MVP</span>
              <button
                onClick={() => setIsProfileOpen(true)}
                title="Meu Perfil"
                style={{
                  background: 'rgba(51, 65, 85, 0.5)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#94a3b8',
                  width: '28px',
                  height: '28px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--app-accent)';
                  e.currentTarget.style.background = 'var(--app-accent-soft)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#94a3b8';
                  e.currentTarget.style.background = 'rgba(51, 65, 85, 0.5)';
                }}
              >
                <User size={15} />
              </button>
            </div>
          </>
        )}
      </aside>

      <ProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
    </>
  );
};
