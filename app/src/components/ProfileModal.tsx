import React, { useEffect, useState } from 'react';
import { useDashboardStore } from '../store/dashboardStore';
import { X, User, HardDrive, Cpu, Download, Upload, ShieldCheck } from 'lucide-react';
import { db } from '../sdk/storage';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const activeInstances = useDashboardStore((state) => state.activeInstances);
  const registeredWidgets = useDashboardStore((state) => state.registeredWidgets);

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
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          overflow: 'hidden',
          color: '#f8fafc',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(30, 41, 59, 0.8)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #0284c7, #38bdf8)',
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
          {/* Card: Perfil Info */}
          <div style={{ background: '#0f172a', borderRadius: '10px', padding: '14px', border: '1px solid #334155' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9' }}>Schema v1.0</span>
              <span style={{ fontSize: '10px', background: '#0284c7', color: '#fff', padding: '2px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <ShieldCheck size={10} /> Local-First
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
              Seus dados e layouts são armazenados localmente no navegador (IndexedDB + LocalStorage).
            </p>
          </div>

          {/* Grid de Métricas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ background: '#0f172a', padding: '12px', borderRadius: '8px', border: '1px solid #334155' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8', marginBottom: '4px' }}>
                <Cpu size={14} />
                <span style={{ fontSize: '11px', fontWeight: 600 }}>Widgets Ativos</span>
              </div>
              <span style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>
                {activeInstances.length} <span style={{ fontSize: '12px', fontWeight: 400, color: '#64748b' }}>/ {registeredWidgets.size} disponíveis</span>
              </span>
            </div>

            <div style={{ background: '#0f172a', padding: '12px', borderRadius: '8px', border: '1px solid #334155' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#4ade80', marginBottom: '4px' }}>
                <HardDrive size={14} />
                <span style={{ fontSize: '11px', fontWeight: 600 }}>Uso do Dexie IDB</span>
              </div>
              <span style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>
                {estimatedSizeKb} KB <span style={{ fontSize: '12px', fontWeight: 400, color: '#64748b' }}>({storageCount} registros)</span>
              </span>
            </div>
          </div>

          {/* Seção Import / Export (Placeholder Fase 5) */}
          <div style={{ borderTop: '1px solid #334155', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
              Portabilidade do Perfil (Fase 5)
            </span>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                disabled
                style={{
                  flex: 1,
                  background: '#334155',
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
                  background: '#334155',
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
        <div style={{ padding: '12px 20px', background: '#0f172a', borderTop: '1px solid #334155', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              background: '#0284c7',
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
