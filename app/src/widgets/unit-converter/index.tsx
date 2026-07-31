import React, { useState } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { Copy, Check, ArrowRightLeft } from 'lucide-react';

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
    mi: { label: 'Milha (mi)', toBase: (v) => v * 1609.34, fromBase: (v) => v / 1609.34 },
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
    psi: { label: 'PSI', toBase: (v) => v * 6894.76, fromBase: (v) => v / 6894.76 },
    atm: { label: 'Atmosfera (atm)', toBase: (v) => v * 101325, fromBase: (v) => v / 101325 },
    mmHg: { label: 'mmHg (Torr)', toBase: (v) => v * 133.322, fromBase: (v) => v / 133.322 },
  },
};

const CATEGORY_LABELS: Record<Category, string> = {
  distance: '📏 Distância',
  temperature: '🌡️ Temperatura',
  pressure: '💨 Pressão',
};

// ─── Component ────────────────────────────────────────────────────────────────

const UnitConverterWidget: React.FC<WidgetComponentProps> = () => {
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

  const selectStyle = {
    background: '#0f172a',
    border: '1px solid #334155',
    color: '#f8fafc',
    borderRadius: '5px',
    padding: '5px 6px',
    fontSize: '11px',
    cursor: 'pointer',
    outline: 'none',
    width: '100%',
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        color: '#f8fafc',
        fontSize: '12px',
        gap: '10px',
      }}
    >
      {/* Category selector */}
      <div
        style={{
          display: 'flex',
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '3px',
          gap: '2px',
        }}
      >
        {(Object.keys(CATEGORY_LABELS) as Category[]).map((cat) => (
          <button
            key={cat}
            onClick={() => handleCategoryChange(cat)}
            style={{
              flex: 1,
              background: category === cat ? '#0284c7' : 'transparent',
              border: 'none',
              color: category === cat ? '#fff' : '#64748b',
              borderRadius: '5px',
              padding: '5px 2px',
              cursor: 'pointer',
              fontSize: '10px',
              fontWeight: 600,
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* From / To */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '10px', color: '#64748b' }}>De:</label>
          <select value={fromUnit} onChange={(e) => setFromUnit(e.target.value)} style={selectStyle}>
            {unitKeys.map((k) => (
              <option key={k} value={k}>{units[k].label}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSwap}
          title="Trocar sentido"
          style={{
            background: 'rgba(51, 65, 85, 0.5)',
            border: '1px solid #334155',
            borderRadius: '6px',
            color: '#94a3b8',
            padding: '5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            marginTop: '14px',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#38bdf8';
            e.currentTarget.style.borderColor = 'rgba(56,189,248,0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#94a3b8';
            e.currentTarget.style.borderColor = '#334155';
          }}
        >
          <ArrowRightLeft size={14} />
        </button>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '10px', color: '#64748b' }}>Para:</label>
          <select value={toUnit} onChange={(e) => setToUnit(e.target.value)} style={selectStyle}>
            {unitKeys.map((k) => (
              <option key={k} value={k}>{units[k].label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Input */}
      <input
        type="number"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="Digite o valor..."
        style={{
          background: '#0f172a',
          border: '1px solid #334155',
          color: '#f8fafc',
          borderRadius: '6px',
          padding: '8px 10px',
          fontSize: '14px',
          outline: 'none',
          width: '100%',
          boxSizing: 'border-box',
          textAlign: 'center',
          fontWeight: 600,
        }}
      />

      {/* Result */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(56, 189, 248, 0.2)',
          borderRadius: '10px',
          padding: '10px',
          gap: '4px',
        }}
      >
        <div style={{ fontSize: '10px', color: '#64748b' }}>Resultado</div>
        <div
          style={{
            fontSize: '22px',
            fontWeight: 700,
            color: '#38bdf8',
            wordBreak: 'break-all',
            textAlign: 'center',
          }}
        >
          {result}
        </div>
        <div style={{ fontSize: '11px', color: '#475569' }}>
          {result !== '—' ? units[toUnit]?.label : ''}
        </div>

        <button
          onClick={handleCopy}
          disabled={result === '—'}
          style={{
            marginTop: '6px',
            background: copied ? 'rgba(74, 222, 128, 0.15)' : 'rgba(56, 189, 248, 0.1)',
            border: `1px solid ${copied ? 'rgba(74, 222, 128, 0.4)' : 'rgba(56, 189, 248, 0.3)'}`,
            color: copied ? '#4ade80' : result !== '—' ? '#38bdf8' : '#334155',
            borderRadius: '6px',
            padding: '4px 12px',
            cursor: result !== '—' ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10px',
            fontWeight: 600,
            transition: 'all 0.2s',
          }}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copiado!' : 'Copiar'}
        </button>
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
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 5 },
    maxSize: { w: 6, h: 8 },
    requiresAgent: false,
  },
  component: UnitConverterWidget,
};
