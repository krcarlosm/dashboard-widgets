import React, { useEffect, useState, useRef } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { Play, Pause, RotateCcw, SkipForward, Settings, Bell, CheckCircle } from 'lucide-react';

interface PomodoroConfig {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesUntilLongBreak: number;
}

type PomodoroPhase = 'focus' | 'short_break' | 'long_break';

const DEFAULT_CONFIG: PomodoroConfig = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesUntilLongBreak: 4,
};

const PomodoroWidget: React.FC<WidgetComponentProps> = ({ context }) => {
  const [config, setConfig] = useState<PomodoroConfig>(DEFAULT_CONFIG);
  const [phase, setPhase] = useState<PomodoroPhase>('focus');
  const [completedCycles, setCompletedCycles] = useState<number>(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(25 * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  const workerRef = useRef<Worker | null>(null);

  // Load config & state
  useEffect(() => {
    async function loadData() {
      const savedConfig = await context.storage.get<PomodoroConfig>('config', DEFAULT_CONFIG);
      setConfig(savedConfig || DEFAULT_CONFIG);

      const savedPhase = await context.storage.get<PomodoroPhase>('phase', 'focus');
      const savedCycles = await context.storage.get<number>('completedCycles', 0);
      const savedSecs = await context.storage.get<number>('remainingSeconds', (savedConfig?.focusMinutes || 25) * 60);

      setPhase(savedPhase || 'focus');
      setCompletedCycles(savedCycles || 0);
      setRemainingSeconds(savedSecs !== undefined ? savedSecs : (savedConfig?.focusMinutes || 25) * 60);
    }
    loadData();
  }, [context.storage]);

  // Setup Web Worker for accurate background interval
  useEffect(() => {
    const workerCode = `
      let timer = null;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          if (timer) clearInterval(timer);
          timer = setInterval(() => {
            self.postMessage('tick');
          }, 1000);
        } else if (e.data === 'stop') {
          if (timer) clearInterval(timer);
          timer = null;
        }
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);

    worker.onmessage = (e) => {
      if (e.data === 'tick') {
        setRemainingSeconds((prev) => Math.max(0, prev - 1));
      }
    };

    workerRef.current = worker;

    return () => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    };
  }, []);

  // Handle Timer completion & Phase transitions
  useEffect(() => {
    if (remainingSeconds === 0 && isRunning) {
      handlePhaseComplete();
    }
  }, [remainingSeconds, isRunning]);

  // Handle worker start/stop
  useEffect(() => {
    if (isRunning) {
      workerRef.current?.postMessage('start');
    } else {
      workerRef.current?.postMessage('stop');
    }
  }, [isRunning]);

  // Save remaining seconds periodically
  useEffect(() => {
    context.storage.set('remainingSeconds', remainingSeconds);
    context.storage.set('phase', phase);
    context.storage.set('completedCycles', completedCycles);
  }, [remainingSeconds, phase, completedCycles, context.storage]);

  const notifyUser = (title: string, body: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.svg' });
    }
  };

  const getPhaseDuration = (p: PomodoroPhase, cfg: PomodoroConfig): number => {
    if (p === 'focus') return cfg.focusMinutes * 60;
    if (p === 'short_break') return cfg.shortBreakMinutes * 60;
    return cfg.longBreakMinutes * 60;
  };

  const handlePhaseComplete = () => {
    setIsRunning(false);
    workerRef.current?.postMessage('stop');

    if (phase === 'focus') {
      const nextCycles = completedCycles + 1;
      setCompletedCycles(nextCycles);

      if (nextCycles % config.cyclesUntilLongBreak === 0) {
        setPhase('long_break');
        setRemainingSeconds(config.longBreakMinutes * 60);
        notifyUser('Pomodoro: Hora da Pausa Longa! 🎉', `Parabéns! Você completou ${config.cyclesUntilLongBreak} ciclos.`);
      } else {
        setPhase('short_break');
        setRemainingSeconds(config.shortBreakMinutes * 60);
        notifyUser('Pomodoro: Hora do Descanso! ☕', 'Descanse um pouco antes do próximo ciclo.');
      }
    } else {
      setPhase('focus');
      setRemainingSeconds(config.focusMinutes * 60);
      notifyUser('Pomodoro: De volta ao Foco! 🚀', 'Hora de concentrar no trabalho.');
    }
  };

  const togglePlay = () => {
    if (!isRunning && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    setIsRunning(!isRunning);
  };

  const resetTimer = () => {
    setIsRunning(false);
    setRemainingSeconds(getPhaseDuration(phase, config));
  };

  const skipPhase = () => {
    setIsRunning(false);
    if (phase === 'focus') {
      setPhase('short_break');
      setRemainingSeconds(config.shortBreakMinutes * 60);
    } else {
      setPhase('focus');
      setRemainingSeconds(config.focusMinutes * 60);
    }
  };

  const updateSettings = async (newConfig: PomodoroConfig) => {
    setConfig(newConfig);
    await context.storage.set('config', newConfig);
    setRemainingSeconds(getPhaseDuration(phase, newConfig));
    setShowSettings(false);
  };

  const formatTime = (secs: number): string => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getPhaseTitle = (): string => {
    if (phase === 'focus') return 'Foco Coletivo';
    if (phase === 'short_break') return 'Pausa Curta';
    return 'Pausa Longa';
  };

  const getPhaseColor = (): string => {
    if (phase === 'focus') return '#ef4444';
    if (phase === 'short_break') return '#38bdf8';
    return '#10b981';
  };

  const totalSecs = getPhaseDuration(phase, config);
  const progressPercent = totalSecs > 0 ? ((totalSecs - remainingSeconds) / totalSecs) * 100 : 0;

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        color: '#f8fafc',
        gap: '8px',
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
        }}
      >
        <span
          style={{
            fontWeight: 600,
            color: getPhaseColor(),
            background: `${getPhaseColor()}20`,
            padding: '2px 8px',
            borderRadius: '12px',
            border: `1px solid ${getPhaseColor()}40`,
          }}
        >
          {getPhaseTitle()}
        </span>

        <button
          onClick={() => setShowSettings(!showSettings)}
          style={{
            background: 'transparent',
            border: 'none',
            color: showSettings ? '#38bdf8' : '#64748b',
            cursor: 'pointer',
            padding: '4px',
          }}
          title="Configurações do Pomodoro"
        >
          <Settings size={15} />
        </button>
      </div>

      {showSettings ? (
        /* Settings Modal Panel */
        <div
          style={{
            width: '100%',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            background: 'rgba(15, 23, 42, 0.8)',
            padding: '10px',
            borderRadius: '8px',
            border: '1px solid #334155',
            fontSize: '11px',
          }}
        >
          <div style={{ fontWeight: 600, color: '#f8fafc', marginBottom: '4px' }}>Configurações de Tempo (min):</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <label>
              Foco:
              <input
                type="number"
                min="1"
                max="120"
                value={config.focusMinutes}
                onChange={(e) => setConfig({ ...config, focusMinutes: parseInt(e.target.value) || 1 })}
                style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px', padding: '4px' }}
              />
            </label>
            <label>
              Pausa Curta:
              <input
                type="number"
                min="1"
                max="60"
                value={config.shortBreakMinutes}
                onChange={(e) => setConfig({ ...config, shortBreakMinutes: parseInt(e.target.value) || 1 })}
                style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px', padding: '4px' }}
              />
            </label>
            <label>
              Pausa Longa:
              <input
                type="number"
                min="1"
                max="60"
                value={config.longBreakMinutes}
                onChange={(e) => setConfig({ ...config, longBreakMinutes: parseInt(e.target.value) || 1 })}
                style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px', padding: '4px' }}
              />
            </label>
            <label>
              Ciclos p/ Pausa Longa:
              <input
                type="number"
                min="1"
                max="10"
                value={config.cyclesUntilLongBreak}
                onChange={(e) => setConfig({ ...config, cyclesUntilLongBreak: parseInt(e.target.value) || 1 })}
                style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px', padding: '4px' }}
              />
            </label>
          </div>
          <button
            onClick={() => updateSettings(config)}
            style={{ marginTop: 'auto', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px', cursor: 'pointer', fontWeight: 600 }}
          >
            Salvar Configurações
          </button>
        </div>
      ) : (
        /* Main Timer View */
        <>
          <div
            style={{
              position: 'relative',
              width: '120px',
              height: '120px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: 'auto',
            }}
          >
            {/* SVG Progress Circle */}
            <svg width="120" height="120" style={{ transform: 'rotate(-90deg)', position: 'absolute' }}>
              <circle cx="60" cy="60" r="52" stroke="#334155" strokeWidth="6" fill="transparent" />
              <circle
                cx="60"
                cy="60"
                r="52"
                stroke={getPhaseColor()}
                strokeWidth="6"
                fill="transparent"
                strokeDasharray={2 * Math.PI * 52}
                strokeDashoffset={2 * Math.PI * 52 * (1 - progressPercent / 100)}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.5s ease' }}
              />
            </svg>

            <span style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.5px' }}>
              {formatTime(remainingSeconds)}
            </span>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={resetTimer}
              title="Resetar tempo"
              style={{ background: 'rgba(51, 65, 85, 0.5)', border: 'none', color: '#94a3b8', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <RotateCcw size={14} />
            </button>

            <button
              onClick={togglePlay}
              title={isRunning ? 'Pausar' : 'Iniciar'}
              style={{ background: getPhaseColor(), border: 'none', color: '#ffffff', borderRadius: '50%', width: '44px', height: '44px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 14px ${getPhaseColor()}50` }}
            >
              {isRunning ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: '2px' }} />}
            </button>

            <button
              onClick={skipPhase}
              title="Pular fase"
              style={{ background: 'rgba(51, 65, 85, 0.5)', border: 'none', color: '#94a3b8', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <SkipForward size={14} />
            </button>
          </div>

          {/* Footer stats */}
          <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle size={12} color="#10b981" />
            <span>Ciclos concluídos: <strong style={{ color: '#f8fafc' }}>{completedCycles}</strong></span>
          </div>
        </>
      )}
    </div>
  );
};

export const pomodoroWidget: WidgetDefinition = {
  manifest: {
    id: 'pomodoro',
    name: 'Timer Pomodoro',
    version: '1.0.0',
    description: 'Gerenciador de ciclos de foco e pausas com notificações e Web Worker em background.',
    icon: 'Clock',
    author: 'Dashboard Core',
    status: 'stable',
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 4 },
    maxSize: { w: 6, h: 6 },
    requiresAgent: false,
  },
  component: PomodoroWidget,
};
