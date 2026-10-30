import React, { useState } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { Copy, Check, Calendar } from 'lucide-react';

type ResultUnit = 'days' | 'weeks' | 'months' | 'all';

// Datas "AAAA-MM-DD" tratadas no fuso local. `new Date('2026-02-01')` seria meia-noite
// UTC — no Brasil, 31/01 às 21h — e deslocaria dias e meses.
const toLocalIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const parseLocalDate = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return isNaN(date.getTime()) ? null : date;
};

export function dateDifference(dateA: string, dateB: string): { days: number; weeks: number; months: number } | null {
  const first = parseLocalDate(dateA);
  const second = parseLocalDate(dateB);
  if (!first || !second) return null;
  // A ordem dos campos não importa: conta sempre da data menor para a maior.
  const [start, end] = first <= second ? [first, second] : [second, first];

  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  const weeks = parseFloat((days / 7).toFixed(2));
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months--;
  return { days, weeks, months };
}

const DateCalcWidget: React.FC<WidgetComponentProps> = () => {
  const today = toLocalIso(new Date());
  const [dateA, setDateA] = useState<string>(today);
  const [dateB, setDateB] = useState<string>(today);
  const [resultUnit, setResultUnit] = useState<ResultUnit>('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const result = dateDifference(dateA, dateB);

  const copyValue = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const resultItems: { key: string; label: string; value: string | number; unit: ResultUnit }[] = result
    ? [
        { key: 'days', label: 'Dias', value: result.days, unit: 'days' },
        { key: 'weeks', label: 'Semanas', value: result.weeks, unit: 'weeks' },
        { key: 'months', label: 'Meses (aprox.)', value: result.months, unit: 'months' },
      ]
    : [];

  const visibleItems =
    resultUnit === 'all' ? resultItems : resultItems.filter((i) => i.unit === resultUnit);

  const inputStyle: React.CSSProperties = {
    background: 'var(--app-input)',
    border: '1px solid var(--app-border)',
    color: 'var(--app-text)',
    borderRadius: '6px',
    padding: '7px 10px',
    fontSize: '12px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  };

  return (
    <div
      style={{
        height: '80%',
        display: 'flex',
        flexDirection: 'column',
        color: 'var(--app-text)',
        fontSize: '12px',
        gap: '10px',
      }}
    >
      {/* Date inputs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '10px', color: '#64748b', marginBottom: '3px' }}>
            Data Inicial:
          </label>
          <input
            type="date"
            value={dateA}
            onChange={(e) => setDateA(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '10px', color: '#64748b', marginBottom: '3px' }}>
            Data Final:
          </label>
          <input
            type="date"
            value={dateB}
            onChange={(e) => setDateB(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Unit filter */}
      <div
        style={{
          display: 'flex',
          background: 'var(--app-input)',
          border: '1px solid var(--app-border)',
          borderRadius: '7px',
          padding: '2px',
          gap: '2px',
        }}
      >
        {(['all', 'days', 'weeks', 'months'] as ResultUnit[]).map((u) => (
          <button
            key={u}
            onClick={() => setResultUnit(u)}
            style={{
              flex: 1,
              background: resultUnit === u ? 'var(--app-accent-strong)' : 'transparent',
              border: 'none',
              color: resultUnit === u ? '#fff' : '#64748b',
              borderRadius: '5px',
              padding: '4px 2px',
              cursor: 'pointer',
              fontSize: '10px',
              fontWeight: 600,
              transition: 'all 0.2s',
            }}
          >
            {u === 'all' ? 'Todos' : u === 'days' ? 'Dias' : u === 'weeks' ? 'Sem.' : 'Meses'}
          </button>
        ))}
      </div>

      {/* Results */}
      {/* 'safe center': centraliza quando cabe e rola (sem cortar o topo) quando não cabe. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'safe center' }}>
        {!result ? (
          <div style={{ textAlign: 'center', color: '#475569', fontSize: '12px' }}>
            <Calendar size={24} style={{ margin: '0 auto 8px', display: 'block', color: '#334155' }} />
            Selecione as datas acima
          </div>
        ) : visibleItems.length === 0 ? null : (
          visibleItems.map((item) => (
            <div
              key={item.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--app-surface-muted)',
                border: '1px solid rgba(51, 65, 85, 0.5)',
                borderRadius: '8px',
                padding: '10px 12px',
              }}
            >
              <div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>{item.label}</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#a78bfa', lineHeight: 1.2 }}>
                  {item.value}
                </div>
              </div>
              <button
                onClick={() => copyValue(item.key, String(item.value))}
                title="Copiar"
                style={{
                  background: copiedKey === item.key ? 'rgba(74, 222, 128, 0.15)' : 'rgba(51, 65, 85, 0.4)',
                  border: `1px solid ${copiedKey === item.key ? 'rgba(74, 222, 128, 0.4)' : 'rgba(51, 65, 85, 0.4)'}`,
                  color: copiedKey === item.key ? '#4ade80' : '#94a3b8',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '10px',
                  fontWeight: 600,
                  transition: 'all 0.2s',
                }}
              >
                {copiedKey === item.key ? <Check size={11} /> : <Copy size={11} />}
                {copiedKey === item.key ? 'Ok!' : 'Copiar'}
              </button>
            </div>
          ))
        )}
      </div>

      {/* Direction label */}
      {result && (
        <div style={{ fontSize: '10px', color: '#475569', textAlign: 'center', flexShrink: 0 }}>
          {dateA <= dateB
            ? `${dateA} → ${dateB}`
            : `${dateB} ← ${dateA}`}
        </div>
      )}
    </div>
  );
};

export const dateCalculatorWidget: WidgetDefinition = {
  manifest: {
    id: 'date-calculator',
    name: 'Calculadora de Datas',
    version: '1.0.0',
    description: 'Calcula a diferença entre duas datas em dias, semanas e meses com click-to-copy.',
    icon: 'Calendar',
    author: 'Dashboard Core',
    status: 'stable',
    defaultSize: { w: 3, h: 5 },
    minSize: { w: 2, h: 4 },
    maxSize: { w: 6, h: 7 },
    requiresAgent: false,
  },
  component: DateCalcWidget,
};
