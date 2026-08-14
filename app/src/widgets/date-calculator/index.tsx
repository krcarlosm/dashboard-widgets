import React, { useState } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { Copy, Check, Calendar } from 'lucide-react';

type ResultUnit = 'days' | 'weeks' | 'months' | 'all';

const DateCalcWidget: React.FC<WidgetComponentProps> = () => {
  const today = new Date().toISOString().split('T')[0];
  const [dateA, setDateA] = useState<string>(today);
  const [dateB, setDateB] = useState<string>(today);
  const [resultUnit, setResultUnit] = useState<ResultUnit>('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const diff = (): { days: number; weeks: number; months: number } | null => {
    if (!dateA || !dateB) return null;
    const a = new Date(dateA);
    const b = new Date(dateB);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;

    const msPerDay = 86400000;
    const days = Math.round(Math.abs(b.getTime() - a.getTime()) / msPerDay);
    const weeks = parseFloat((days / 7).toFixed(2));

    const ya = a.getFullYear(), ma = a.getMonth(), da = a.getDate();
    const yb = b.getFullYear(), mb = b.getMonth(), db = b.getDate();
    let months = (yb - ya) * 12 + (mb - ma);
    if (db < da) months--;
    months = Math.abs(months);

    return { days, weeks, months };
  };

  const result = diff();

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
    background: '#0f172a',
    border: '1px solid #334155',
    color: '#f8fafc',
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
        color: '#f8fafc',
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
          background: '#0f172a',
          border: '1px solid #334155',
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
              background: resultUnit === u ? '#0284c7' : 'transparent',
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center' }}>
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
                background: 'rgba(15, 23, 42, 0.6)',
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
          {new Date(dateA) <= new Date(dateB)
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
    defaultSize: { w: 3, h: 4 },
    minSize: { w: 2, h: 4 },
    maxSize: { w: 6, h: 7 },
    requiresAgent: false,
  },
  component: DateCalcWidget,
};
