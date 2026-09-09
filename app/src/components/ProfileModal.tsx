import React, { useEffect, useState } from 'react';
import { useDashboardStore } from '../store/dashboardStore';
import { X, User, HardDrive, Cpu, Download, Upload, ShieldCheck, MoonStar, SunMedium, Sparkles, RotateCcw } from 'lucide-react';
import { db } from '../sdk/storage';

// ─────────────────────────────────────────────────────────────────────────────
// ProfileModal — Modal de configurações e diagnóstico do dashboard.
//
// Seções:
//  • Tema & Aparência: controla theme (dark/light), density e accentColor.
//  • Diagnóstico Local: exibe schema e informa que os dados são local-first.
//  • Métricas: widgets ativos e uso de armazenamento (IndexedDB via Dexie).
//  • Ações globais: Reset Global e futuramente Import/Export de perfil.
//
// COMO ADICIONAR UMA NOVA COR DE TEMA (accentColor):
//   1. Adicione a nova chave no array da linha ~195 (ex: 'rose').
//   2. Adicione o label de exibição no ternário abaixo (ex: value === 'rose' ? 'Rosa' : ...).
//   3. Em App.tsx, adicione a mesma chave no objeto 'accentMap' com as variantes
//      base, strong, soft e border.
//   4. Em dashboardStore.ts (função normalizeAppearance), adicione a chave na
//      lista de valores válidos do accentColor para que ela seja persistida.
// ─────────────────────────────────────────────────────────────────────────────

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const activeInstances = useDashboardStore((state) => state.activeInstances);
  const registeredWidgets = useDashboardStore((state) => state.registeredWidgets);
  const theme = useDashboardStore((state) => state.theme);
  const density = useDashboardStore((state) => state.density);
  const accentColor = useDashboardStore((state) => state.accentColor);
  const setAppearance = useDashboardStore((state) => state.setAppearance);
  const resetDashboard = useDashboardStore((state) => state.resetDashboard);

  const [storageCount, setStorageCount] = useState<number>(0);
  const [estimatedSizeKb, setEstimatedSizeKb] = useState<number>(0);

  useEffect(() => {
    if (!isOpen) return;

    async function fetchStorageStats() {
      try {
        const count = await db.kvStore.count();
        const allRecords = await db.kvStore.toArray();
        const jsonString = JSON.stringify(allRecords);
        const bytes = new Blob([jsonString]).size;
        setStorageCount(count);
        setEstimatedSizeKb(Math.round((bytes / 1024) * 100) / 100);
      } catch (err) {
        console.error('Erro ao calcular estatísticas de storage:', err);
      }
    }

    fetchStorageStats();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '460px',
          background: 'var(--app-surface)',
          border: '1px solid #334155',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          overflow: 'hidden',
          color: 'var(--app-text)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--app-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--app-surface-elevated)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, var(--app-accent-strong), var(--app-accent))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <User size={18} color="#ffffff" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Meu Perfil</h2>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Configurações & Diagnóstico Local</span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Card: Aparência */}
          <div style={{ background: 'var(--app-surface-muted)', borderRadius: '10px', padding: '14px', border: '1px solid var(--app-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <Sparkles size={14} color="var(--app-accent)" />
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--app-text)' }}>Tema & Aparência</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setAppearance({ theme: 'dark' })}
                  style={{
                    background: theme === 'dark' ? 'var(--app-accent-soft)' : 'var(--app-surface-elevated)',
                    color: 'var(--app-text)',
                    border: '1px solid var(--app-accent-border)',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <MoonStar size={13} /> Escuro
                </button>
                <button
                  onClick={() => setAppearance({ theme: 'light' })}
                  style={{
                    background: theme === 'light' ? 'var(--app-accent-soft)' : 'var(--app-surface-elevated)',
                    color: 'var(--app-text)',
                    border: '1px solid var(--app-accent-border)',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <SunMedium size={13} /> Claro
                </button>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setAppearance({ density: 'comfortable' })}
                  style={{
                    background: density === 'comfortable' ? 'var(--app-accent-soft)' : 'var(--app-surface-elevated)',
                    color: 'var(--app-text)',
                    border: '1px solid var(--app-accent-border)',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  Confortável
                </button>
                <button
                  onClick={() => setAppearance({ density: 'compact' })}
                  style={{
                    background: density === 'compact' ? 'var(--app-accent-soft)' : 'var(--app-surface-elevated)',
                    color: 'var(--app-text)',
                    border: '1px solid var(--app-accent-border)',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  Compacto
                </button>
              </div>
              {/* ── Seleção de Cor de Tema (accentColor) ──────────────────────────
                   Para ADICIONAR uma nova cor aqui:
                   1. Adicione sua chave neste array (ex: 'rose').
                   2. Adicione o label no ternário de exibição abaixo.
                   3. Registre a chave em App.tsx > accentMap.
                   4. Registre a chave em dashboardStore.ts > normalizeAppearance.
              ────────────────────────────────────────────────────────────────── */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {(['sky','violet','emerald', 'rose', 'amber', 'indigo'] as const).map((value) => (
                  <button
                    key={value}
                    onClick={() => setAppearance({ accentColor: value })}
                    style={{
                      background: accentColor === value ? 'var(--app-accent-soft)' : 'var(--app-surface-elevated)',
                      color: 'var(--app-text)',
                      border: '1px solid var(--app-accent-border)',
                      borderRadius: '8px',
                      padding: '6px 10px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    {value === 'sky' ? 'Azul' : value === 'violet' ? 'Violeta' : value === 'rose' ? 'Rosa': value === 'amber' ? 'Âmbar' : value === 'emerald' ? 'Esmeralda' : value === 'indigo' ? 'Índigo' : ''}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Card: Perfil Info */}
          <div style={{ background: 'var(--app-surface-muted)', borderRadius: '10px', padding: '14px', border: '1px solid var(--app-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--app-text)' }}>Schema v1.0</span>
              <span style={{ fontSize: '10px', background: 'var(--app-accent-strong)', color: '#fff', padding: '2px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <ShieldCheck size={10} /> Local-First
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
              Seus dados e layouts são armazenados localmente no navegador (IndexedDB + LocalStorage).
            </p>
          </div>

          {/* Grid de Métricas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ background: 'var(--app-surface-muted)', padding: '12px', borderRadius: '8px', border: '1px solid var(--app-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--app-accent)', marginBottom: '4px' }}>
                <Cpu size={14} />
                <span style={{ fontSize: '11px', fontWeight: 600 }}>Widgets Ativos</span>
              </div>
              <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--app-text)' }}>
                {activeInstances.length} <span style={{ fontSize: '12px', fontWeight: 400, color: '#64748b' }}>/ {registeredWidgets.size} disponíveis</span>
              </span>
            </div>

            <div style={{ background: 'var(--app-input)', padding: '12px', borderRadius: '8px', border: '1px solid var(--app-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#4ade80', marginBottom: '4px' }}>
                <HardDrive size={14} />
                <span style={{ fontSize: '11px', fontWeight: 600 }}>Uso do Dexie IDB</span>
              </div>
              <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--app-text)' }}>
                {estimatedSizeKb} KB <span style={{ fontSize: '12px', fontWeight: 400, color: '#64748b' }}>({storageCount} registros)</span>
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            <button
              onClick={() => {
                resetDashboard();
                onClose();
              }}
              style={{
                flex: 1,
                background: 'rgba(248, 113, 113, 0.14)',
                color: '#f87171',
                border: '1px solid rgba(248, 113, 113, 0.32)',
                borderRadius: '8px',
                padding: '8px 10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              <RotateCcw size={14} /> Reset Global
            </button>
          </div>

          {/* Seção Import / Export (Placeholder Fase 5) */}
          <div style={{ borderTop: '1px solid var(--app-border)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
              Portabilidade do Perfil (Fase 5)
            </span>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                disabled
                style={{
                  flex: 1,
                  background: 'var(--app-surface-elevated)',
                  color: '#94a3b8',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px',
                  fontSize: '12px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  cursor: 'not-allowed',
                  opacity: 0.7,
                }}
              >
                <Download size={14} />
                <span>Exportar Perfil</span>
              </button>

              <button
                disabled
                style={{
                  flex: 1,
                  background: 'var(--app-surface-elevated)',
                  color: '#94a3b8',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px',
                  fontSize: '12px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  cursor: 'not-allowed',
                  opacity: 0.7,
                }}
              >
                <Upload size={14} />
                <span>Importar Perfil</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', background: 'var(--app-surface-muted)', borderTop: '1px solid var(--app-border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              background: 'var(--app-accent-strong)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 16px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
