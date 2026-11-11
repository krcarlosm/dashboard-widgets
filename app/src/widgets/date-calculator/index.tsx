import React, { useState } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { Copy, Check, Calendar } from 'lucide-react';
import { Button, EmptyState, FieldLabel, Input, ListItem, SegmentedControl } from '../../ui';

type ResultUnit = 'days' | 'weeks' | 'months' | 'years' | 'all';

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

/** Soma anos mantendo o dia (29/02 vira 28/02 em anos não bissextos). */
const addYears = (date: Date, years: number): Date => {
  const lastDay = new Date(date.getFullYear() + years, date.getMonth() + 1, 0).getDate();
  return new Date(date.getFullYear() + years, date.getMonth(), Math.min(date.getDate(), lastDay));
};

/**
 * Anos completos + a fração do ano seguinte já decorrida, com no máximo 1 casa decimal
 * (ex.: 01/01/2024 → 01/07/2025 = 1,5). Usa o calendário, então anos bissextos contam certo.
 */
export function yearsBetween(start: Date, end: Date): number {
  let whole = end.getFullYear() - start.getFullYear();
  if (addYears(start, whole) > end) whole--;
  const anchor = addYears(start, whole);
  const next = addYears(start, whole + 1);
  const fraction = (end.getTime() - anchor.getTime()) / (next.getTime() - anchor.getTime());
  return Math.round((whole + fraction) * 10) / 10;
}

export function dateDifference(dateA: string, dateB: string): { days: number; weeks: number; months: number; years: number } | null {
  const first = parseLocalDate(dateA);
  const second = parseLocalDate(dateB);
  if (!first || !second) return null;
  // A ordem dos campos não importa: conta sempre da data menor para a maior.
  const [start, end] = first <= second ? [first, second] : [second, first];

  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  const weeks = parseFloat((days / 7).toFixed(2));
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months--;
  return { days, weeks, months, years: yearsBetween(start, end) };
}

const DateCalcWidget: React.FC<WidgetComponentProps> = ({ context }) => {
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
        { key: 'years', label: 'Anos', value: result.years, unit: 'years' },
      ]
    : [];

  const visibleItems =
    resultUnit === 'all' ? resultItems : resultItems.filter((i) => i.unit === resultUnit);

  const startId = `${context.instanceId}-data-inicial`;
  const endId = `${context.instanceId}-data-final`;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', color: 'var(--app-text)', fontSize: 'var(--font-md)', gap: '10px' }}>
      {/* Date inputs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div>
          <FieldLabel htmlFor={startId}>Data Inicial:</FieldLabel>
          <Input id={startId} type="date" value={dateA} onChange={(e) => setDateA(e.target.value)} style={{ width: '100%', fontFamily: 'inherit' }} />
        </div>
        <div>
          <FieldLabel htmlFor={endId}>Data Final:</FieldLabel>
          <Input id={endId} type="date" value={dateB} onChange={(e) => setDateB(e.target.value)} style={{ width: '100%', fontFamily: 'inherit' }} />
        </div>
      </div>

      <SegmentedControl
        stretch
        ariaLabel="Unidade do resultado"
        value={resultUnit}
        onChange={setResultUnit}
        options={[
          { id: 'all', label: 'Todos' },
          { id: 'days', label: 'Dias' },
          { id: 'weeks', label: 'Sem.', title: 'Semanas' },
          { id: 'months', label: 'Meses' },
          { id: 'years', label: 'Anos' },
        ]}
      />

      {/* Results */}
      {/* 'safe center': centraliza quando cabe e rola (sem cortar o topo) quando não cabe. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'safe center' }}>
        {!result ? (
          <EmptyState icon={<Calendar size={24} />} title="Selecione as datas acima" />
        ) : (
          visibleItems.map((item) => (
            <ListItem key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px' }}>
              <div>
                <div style={{ fontSize: 'var(--font-xs)', color: 'var(--app-muted)' }}>{item.label}</div>
                <div style={{ fontSize: 'var(--font-xl)', fontWeight: 700, color: 'var(--widget-accent)', lineHeight: 1.2 }}>{item.value}</div>
              </div>
              <Button
                onClick={() => copyValue(item.key, String(item.value))}
                title="Copiar"
                icon={copiedKey === item.key ? <Check size={11} /> : <Copy size={11} />}
                style={copiedKey === item.key ? { color: 'var(--app-success)', borderColor: 'var(--app-success)' } : undefined}
              >
                {copiedKey === item.key ? 'Ok!' : 'Copiar'}
              </Button>
            </ListItem>
          ))
        )}
      </div>

      {/* Direction label */}
      {result && (
        <div style={{ fontSize: 'var(--font-xs)', color: 'var(--app-muted)', textAlign: 'center', flexShrink: 0 }}>
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
    version: '1.1.0',
    description: 'Calcula a diferença entre duas datas em dias, semanas, meses e anos com click-to-copy.',
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
