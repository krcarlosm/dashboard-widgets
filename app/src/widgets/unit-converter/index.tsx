import React, { useState } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { Copy, Check, ArrowRightLeft } from 'lucide-react';
import { Button, FieldLabel, IconButton, Input, SegmentedControl, Select } from '../../ui';

// ─── Unit definitions ─────────────────────────────────────────────────────────

type Category = 'distance' | 'temperature' | 'pressure';

interface Unit {
  label: string;
  toBase: (v: number) => number;   // convert TO base unit
  fromBase: (v: number) => number; // convert FROM base unit
}

const UNITS: Record<Category, Record<string, Unit>> = {
  distance: {
    mm: { label: 'Milímetro (mm)', toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
    cm: { label: 'Centímetro (cm)', toBase: (v) => v / 100, fromBase: (v) => v * 100 },
    m: { label: 'Metro (m)', toBase: (v) => v, fromBase: (v) => v },
    km: { label: 'Quilômetro (km)', toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
    in: { label: 'Polegada (in)', toBase: (v) => v * 0.0254, fromBase: (v) => v / 0.0254 },
    ft: { label: 'Pé (ft)', toBase: (v) => v * 0.3048, fromBase: (v) => v / 0.3048 },
    yd: { label: 'Jarda (yd)', toBase: (v) => v * 0.9144, fromBase: (v) => v / 0.9144 },
    mi: { label: 'Milha (mi)', toBase: (v) => v * 1609.344, fromBase: (v) => v / 1609.344 },
  },
  temperature: {
    C: { label: 'Celsius (°C)', toBase: (v) => v, fromBase: (v) => v },
    F: { label: 'Fahrenheit (°F)', toBase: (v) => (v - 32) * 5 / 9, fromBase: (v) => v * 9 / 5 + 32 },
    K: { label: 'Kelvin (K)', toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
  },
  pressure: {
    Pa: { label: 'Pascal (Pa)', toBase: (v) => v, fromBase: (v) => v },
    kPa: { label: 'Kilopascal (kPa)', toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
    MPa: { label: 'Megapascal (MPa)', toBase: (v) => v * 1e6, fromBase: (v) => v / 1e6 },
    bar: { label: 'Bar', toBase: (v) => v * 100000, fromBase: (v) => v / 100000 },
    psi: { label: 'PSI', toBase: (v) => v * 6894.757293168, fromBase: (v) => v / 6894.757293168 },
    atm: { label: 'Atmosfera (atm)', toBase: (v) => v * 101325, fromBase: (v) => v / 101325 },
    mmHg: { label: 'mmHg (Torr)', toBase: (v) => v * 133.322387415, fromBase: (v) => v / 133.322387415 },
  },
};

const CATEGORY_LABELS: Record<Category, string> = {
  distance: '📏 Distância',
  temperature: '🌡️ Temperatura',
  pressure: '💨 Pressão',
};

// ─── Component ────────────────────────────────────────────────────────────────

const UnitConverterWidget: React.FC<WidgetComponentProps> = ({ context }) => {
  const [category, setCategory] = useState<Category>('distance');
  const [fromUnit, setFromUnit] = useState<string>('m');
  const [toUnit, setToUnit] = useState<string>('ft');
  const [inputValue, setInputValue] = useState<string>('1');
  const [copied, setCopied] = useState<boolean>(false);

  const units = UNITS[category];
  const unitKeys = Object.keys(units);

  const handleCategoryChange = (cat: Category) => {
    setCategory(cat);
    const keys = Object.keys(UNITS[cat]);
    setFromUnit(keys[0]);
    setToUnit(keys[1] || keys[0]);
    setInputValue('1');
  };

  const handleSwap = () => {
    setFromUnit(toUnit);
    setToUnit(fromUnit);
  };

  const compute = (): string => {
    const val = parseFloat(inputValue);
    if (isNaN(val)) return '—';
    const from = units[fromUnit];
    const to = units[toUnit];
    if (!from || !to) return '—';
    const base = from.toBase(val);
    const result = to.fromBase(base);
    // Smart formatting
    if (Math.abs(result) >= 1e10 || (Math.abs(result) < 1e-4 && result !== 0)) {
      return result.toExponential(6);
    }
    return parseFloat(result.toPrecision(10)).toString();
  };

  const result = compute();

  const handleCopy = async () => {
    if (result === '—') return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fromId = `${context.instanceId}-de`;
  const toId = `${context.instanceId}-para`;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', color: 'var(--app-text)', fontSize: 'var(--font-md)', gap: '12px' }}>
      <SegmentedControl
        stretch
        ariaLabel="Grandeza"
        value={category}
        onChange={handleCategoryChange}
        options={(Object.keys(CATEGORY_LABELS) as Category[]).map((cat) => ({ id: cat, label: CATEGORY_LABELS[cat] }))}
      />

      {/* De / Para */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <FieldLabel htmlFor={fromId}>De:</FieldLabel>
          <Select id={fromId} value={fromUnit} onChange={(e) => setFromUnit(e.target.value)} style={{ width: '100%' }}>
            {unitKeys.map((k) => <option key={k} value={k}>{units[k].label}</option>)}
          </Select>
        </div>
        <IconButton label="Trocar sentido" icon={<ArrowRightLeft size={14} />} bordered onClick={handleSwap} style={{ padding: '5px 7px' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <FieldLabel htmlFor={toId}>Para:</FieldLabel>
          <Select id={toId} value={toUnit} onChange={(e) => setToUnit(e.target.value)} style={{ width: '100%' }}>
            {unitKeys.map((k) => <option key={k} value={k}>{units[k].label}</option>)}
          </Select>
        </div>
      </div>

      <Input
        type="number"
        aria-label="Valor a converter"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="Digite o valor..."
        style={{ width: '100%', padding: '8px 10px', fontSize: 'var(--font-lg)', textAlign: 'center', fontWeight: 600 }}
      />

      {/* Resultado */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'safe center',
          background: 'var(--app-surface-muted)',
          border: '1px solid var(--widget-accent-border)',
          borderRadius: 'var(--radius-xl)',
          padding: '10px',
          gap: '4px',
          overflowY: 'auto',
        }}
      >
        <div style={{ fontSize: 'var(--font-xs)', color: 'var(--app-muted)' }}>Resultado</div>
        <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--widget-accent)', wordBreak: 'break-all', textAlign: 'center' }}>{result}</div>
        <div style={{ fontSize: 'var(--font-sm)', color: 'var(--app-muted)' }}>{result !== '—' ? units[toUnit]?.label : ''}</div>
        <Button
          onClick={handleCopy}
          disabled={result === '—'}
          icon={copied ? <Check size={11} /> : <Copy size={11} />}
          style={{ marginTop: '6px', ...(copied ? { color: 'var(--app-success)', borderColor: 'var(--app-success)' } : {}) }}
        >
          {copied ? 'Copiado!' : 'Copiar'}
        </Button>
      </div>
    </div>
  );
};

export const unitConverterWidget: WidgetDefinition = {
  manifest: {
    id: 'unit-converter',
    name: 'Conversor de Unidades',
    version: '1.0.0',
    description: 'Converte distância, temperatura e pressão com resultado em 1 clique.',
    icon: 'ArrowRightLeft',
    author: 'Dashboard Core',
    status: 'stable',
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 4 },
    maxSize: { w: 6, h: 8 },
    requiresAgent: false,
  },
  component: UnitConverterWidget,
};
