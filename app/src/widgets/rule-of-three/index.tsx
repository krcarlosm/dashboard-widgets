import React, { useState } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { Copy, Check, Divide } from 'lucide-react';

/**
 * Rule of Three (Regra de Três) — Simple & Compound
 *
 * Simple: A/B = C/X → X = B*C/A
 *
 * Input: A, B, C → Solve for X
 */

const RuleOfThreeWidget: React.FC<WidgetComponentProps> = () => {
  const [a, setA] = useState<string>('');
  const [b, setB] = useState<string>('');
  const [c, setC] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const av = parseFloat(a);
  const bv = parseFloat(b);
  const cv = parseFloat(c);

  const isValid = !isNaN(av) && !isNaN(bv) && !isNaN(cv) && av !== 0;
  const result: number | null = isValid ? (bv * cv) / av : null;

  const formatResult = (r: number): string => {
    if (Math.abs(r) >= 1e10 || (Math.abs(r) < 1e-4 && r !== 0)) {
      return r.toExponential(6);
    }
    return parseFloat(r.toPrecision(10)).toString();
  };

  const displayResult = result !== null ? formatResult(result) : '—';

  const handleCopy = async () => {
    if (result === null) return;
    await navigator.clipboard.writeText(displayResult);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--app-input)',
    border: '1px solid var(--app-border)',
    color: 'var(--app-text)',
    borderRadius: '6px',
    padding: '8px 10px',
    fontSize: '16px',
    outline: 'none',
    textAlign: 'center',
    fontWeight: 700,
    boxSizing: 'border-box',
    width: '100%',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '10px',
    color: '#64748b',
    textAlign: 'center' as const,
    marginBottom: '3px',
  };

  const dividerStyle: React.CSSProperties = {
    width: '100%',
    height: '1px',
    background: '#334155',
    margin: '0',
  };

  const fractionStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '2px',
    flex: 1,
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        color: 'var(--app-text)',
        fontSize: '12px',
        gap: '10px',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center' }}>
        Se <strong style={{ color: 'var(--app-text)' }}>A</strong> corresponde a <strong style={{ color: 'var(--app-text)' }}>B</strong>,
        <br />
        então <strong style={{ color: 'var(--app-text)' }}>C</strong> corresponde a <strong style={{ color: 'var(--app-accent)' }}>X</strong>
      </div>

      {/* A/B = C/X layout */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
        {/* A/B */}
        <div style={fractionStyle}>
          <div style={labelStyle}>A</div>
          <input
            type="number"
            value={a}
            onChange={(e) => setA(e.target.value)}
            placeholder="A"
            style={{ ...inputStyle, borderColor: a && !isNaN(av) ? 'var(--app-accent-border)' : '#334155' }}
          />
          <div style={dividerStyle} />
          <input
            type="number"
            value={b}
            onChange={(e) => setB(e.target.value)}
            placeholder="B"
            style={{ ...inputStyle, borderColor: b && !isNaN(bv) ? 'var(--app-accent-border)' : '#334155' }}
          />
          <div style={labelStyle}>B</div>
        </div>

        {/* = */}
        <div style={{ fontSize: '22px', color: '#475569', fontWeight: 700, flexShrink: 0 }}>=</div>

        {/* C/X */}
        <div style={fractionStyle}>
          <div style={labelStyle}>C</div>
          <input
            type="number"
            value={c}
            onChange={(e) => setC(e.target.value)}
            placeholder="C"
            style={{ ...inputStyle, borderColor: c && !isNaN(cv) ? 'var(--app-accent-border)' : '#334155' }}
          />
          <div style={dividerStyle} />
          {/* X = result */}
          <div
            style={{
              ...inputStyle,
              background: result !== null ? 'var(--app-accent-soft)' : 'var(--app-input)',
              border: `1px solid ${result !== null ? 'var(--app-accent-border)' : 'var(--app-border)'}`,
              color: result !== null ? 'var(--app-accent)' : 'var(--app-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '40px',
              borderRadius: '6px',
              fontSize: result !== null ? '18px' : '14px',
              cursor: result !== null ? 'pointer' : 'default',
            }}
            onClick={result !== null ? handleCopy : undefined}
            title={result !== null ? 'Clique para copiar' : ''}
          >
            {displayResult}
          </div>
          <div style={{ ...labelStyle, color: 'var(--app-accent)' }}>X</div>
        </div>
      </div>

      {/* Formula reminder */}
      {result !== null && (
        <div style={{ fontSize: '10px', color: '#475569', textAlign: 'center' }}>
          X = (B × C) / A = ({bv} × {cv}) / {av} = {displayResult}
        </div>
      )}

      {/* Copy button */}
      <button
        onClick={handleCopy}
        disabled={result === null}
        style={{
          background: copied ? 'rgba(74, 222, 128, 0.15)' : result !== null ? 'rgba(167, 139, 250, 0.15)' : 'rgba(30, 41, 59, 0.4)',
          border: `1px solid ${copied ? 'rgba(74, 222, 128, 0.4)' : result !== null ? 'rgba(167, 139, 250, 0.4)' : '#334155'}`,
          color: copied ? '#4ade80' : result !== null ? '#a78bfa' : '#334155',
          borderRadius: '6px',
          padding: '6px 16px',
          cursor: result !== null ? 'pointer' : 'default',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          fontSize: '11px',
          fontWeight: 600,
          transition: 'all 0.2s',
        }}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? 'Copiado!' : 'Copiar resultado'}
      </button>

      {/* Clear */}
      {(a || b || c) && (
        <button
          onClick={() => { setA(''); setB(''); setC(''); }}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#475569',
            cursor: 'pointer',
            fontSize: '10px',
            textDecoration: 'underline',
          }}
        >
          Limpar campos
        </button>
      )}
    </div>
  );
};

export const ruleOfThreeWidget: WidgetDefinition = {
  manifest: {
    id: 'rule-of-three',
    name: 'Regra de Três',
    version: '1.0.0',
    description: 'Calculadora de regra de três simples (A/B = C/X) com resultado click-to-copy.',
    icon: 'Divide',
    author: 'Dashboard Core',
    status: 'stable',
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 5 },
    maxSize: { w: 6, h: 7 },
    requiresAgent: false,
  },
  component: RuleOfThreeWidget,
};
