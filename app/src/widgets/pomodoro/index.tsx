import React, { useEffect, useState, useRef } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { Play, Pause, RotateCcw, SkipForward, Settings, Bell, CheckCircle, Timer, AlarmClock, Hourglass, Edit2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type TimerMode = 'pomodoro' | 'countdown' | 'stopwatch';

interface PomodoroConfig {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesUntilLongBreak: number;
  customTitle: string;
}

type PomodoroPhase = 'focus' | 'short_break' | 'long_break';

const DEFAULT_CONFIG: PomodoroConfig = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesUntilLongBreak: 4,
  customTitle: '',
};

// ─── Component ────────────────────────────────────────────────────────────────

const TimerWidget: React.FC<WidgetComponentProps> = ({ context }) => {
  const [mode, setMode] = useState<TimerMode>('pomodoro');
  const [config, setConfig] = useState<PomodoroConfig>(DEFAULT_CONFIG);
  const [phase, setPhase] = useState<PomodoroPhase>('focus');
  const [completedCycles, setCompletedCycles] = useState<number>(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(25 * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Countdown-specific
  const [countdownMinutes, setCountdownMinutes] = useState<number>(10);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(0);
  const [countdownInitialSecs, setCountdownInitialSecs] = useState<number>(600);
  const [countdownRemaining, setCountdownRemaining] = useState<number>(600);

  // Stopwatch-specific
  const [stopwatchMs, setStopwatchMs] = useState<number>(0);
  const stopwatchIntervalRef = useRef<any>(null);

  // Title editing
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);

  const workerRef = useRef<Worker | null>(null);

  // ── Load saved state ──
  useEffect(() => {
    async function loadData() {
      const savedMode = await context.storage.get<TimerMode>('mode', 'pomodoro');
      const savedConfig = await context.storage.get<PomodoroConfig>('config', DEFAULT_CONFIG);
      const savedPhase = await context.storage.get<PomodoroPhase>('phase', 'focus');
      const savedCycles = await context.storage.get<number>('completedCycles', 0);
      const savedSecs = await context.storage.get<number>('remainingSeconds', (savedConfig?.focusMinutes || 25) * 60);
      const savedCdInitial = await context.storage.get<number>('countdownInitialSecs', 600);
      const savedCdRemaining = await context.storage.get<number>('countdownRemaining', 600);

      setMode(savedMode || 'pomodoro');
      setConfig(savedConfig || DEFAULT_CONFIG);
      setPhase(savedPhase || 'focus');
      setCompletedCycles(savedCycles || 0);
      setRemainingSeconds(savedSecs !== undefined ? savedSecs : (savedConfig?.focusMinutes || 25) * 60);
      setCountdownInitialSecs(savedCdInitial || 600);
      setCountdownRemaining(savedCdRemaining !== undefined ? savedCdRemaining : 600);
      setCountdownMinutes(Math.floor((savedCdInitial || 600) / 60));
      setCountdownSeconds((savedCdInitial || 600) % 60);
    }
    loadData();
  }, [context.storage]);

  // ── Web Worker for Pomodoro & Countdown ──
  useEffect(() => {
    const workerCode = `
      let timer = null;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          if (timer) clearInterval(timer);
          timer = setInterval(() => { self.postMessage('tick'); }, 1000);
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
        if (mode === 'pomodoro') {
          setRemainingSeconds((prev) => Math.max(0, prev - 1));
        } else if (mode === 'countdown') {
          setCountdownRemaining((prev) => Math.max(0, prev - 1));
        }
      }
    };

    workerRef.current = worker;
    return () => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    };
  }, [mode]);

  // ── Worker start/stop ──
  useEffect(() => {
    if (mode !== 'stopwatch') {
      if (isRunning) {
        workerRef.current?.postMessage('start');
      } else {
        workerRef.current?.postMessage('stop');
      }
    }
  }, [isRunning, mode]);

  // ── Stopwatch ──
  useEffect(() => {
    if (mode === 'stopwatch') {
      if (isRunning) {
        stopwatchIntervalRef.current = setInterval(() => {
          setStopwatchMs((prev) => prev + 10);
        }, 10);
      } else {
        clearInterval(stopwatchIntervalRef.current);
      }
      return () => clearInterval(stopwatchIntervalRef.current);
    }
  }, [isRunning, mode]);

  // ── Pomodoro completion ──
  useEffect(() => {
    if (mode === 'pomodoro' && remainingSeconds === 0 && isRunning) {
      handlePomodoroPhaseComplete();
    }
  }, [remainingSeconds, isRunning, mode]);

  // ── Countdown completion ──
  useEffect(() => {
    if (mode === 'countdown' && countdownRemaining === 0 && isRunning) {
      setIsRunning(false);
      workerRef.current?.postMessage('stop');
      const displayTitle = config.customTitle || 'Temporizador';
      notifyUser(`⏰ ${displayTitle}`, 'Tempo esgotado!');
    }
  }, [countdownRemaining, isRunning, mode]);

  // ── Save state ──
  useEffect(() => {
    context.storage.set('mode', mode);
    context.storage.set('remainingSeconds', remainingSeconds);
    context.storage.set('phase', phase);
    context.storage.set('completedCycles', completedCycles);
    context.storage.set('countdownInitialSecs', countdownInitialSecs);
    context.storage.set('countdownRemaining', countdownRemaining);
  }, [mode, remainingSeconds, phase, completedCycles, countdownInitialSecs, countdownRemaining]);

  // ── Helpers ──
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

  const handlePomodoroPhaseComplete = () => {
    setIsRunning(false);
    workerRef.current?.postMessage('stop');
    const displayTitle = config.customTitle || 'Pomodoro';

    if (phase === 'focus') {
      const nextCycles = completedCycles + 1;
      setCompletedCycles(nextCycles);
      if (nextCycles % config.cyclesUntilLongBreak === 0) {
        setPhase('long_break');
        setRemainingSeconds(config.longBreakMinutes * 60);
        notifyUser(`🎉 ${displayTitle}`, `Pausa longa! ${config.cyclesUntilLongBreak} ciclos concluídos.`);
      } else {
        setPhase('short_break');
        setRemainingSeconds(config.shortBreakMinutes * 60);
        notifyUser(`☕ ${displayTitle}`, 'Hora do descanso!');
      }
    } else {
      setPhase('focus');
      setRemainingSeconds(config.focusMinutes * 60);
      notifyUser(`🚀 ${displayTitle}`, 'De volta ao foco!');
    }
  };

  const togglePlay = async () => {
    if (!isRunning && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    setIsRunning(!isRunning);
  };

  const resetTimer = () => {
    setIsRunning(false);
    if (mode === 'pomodoro') {
      setRemainingSeconds(getPhaseDuration(phase, config));
    } else if (mode === 'countdown') {
      setCountdownRemaining(countdownInitialSecs);
    } else {
      setStopwatchMs(0);
    }
  };

  const skipPhase = () => {
    if (mode !== 'pomodoro') return;
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

  const applyCountdownInput = () => {
    const total = (countdownMinutes * 60) + countdownSeconds;
    setCountdownInitialSecs(total);
    setCountdownRemaining(total);
    setIsRunning(false);
  };

  const formatTime = (secs: number): string => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatStopwatch = (ms: number): string => {
    const totalSecs = Math.floor(ms / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    const cs = Math.floor((ms % 1000) / 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
  };

  const getPhaseColor = (): string => {
    if (mode === 'stopwatch') return '#f59e0b';
    if (mode === 'countdown') return '#a78bfa';
    if (phase === 'focus') return '#ef4444';
    if (phase === 'short_break') return '#38bdf8';
    return '#10b981';
  };

  const getPomodoroPhaseLabel = (): string => {
    if (phase === 'focus') return 'Foco';
    if (phase === 'short_break') return 'Pausa Curta';
    return 'Pausa Longa';
  };

  const totalSecs =
    mode === 'pomodoro'
      ? getPhaseDuration(phase, config)
      : mode === 'countdown'
      ? countdownInitialSecs
      : 0;

  const currentSecs =
    mode === 'pomodoro' ? remainingSeconds : mode === 'countdown' ? countdownRemaining : 0;

  const progressPercent = totalSecs > 0 ? ((totalSecs - currentSecs) / totalSecs) * 100 : 0;

  const displayTitle = config.customTitle || (mode === 'pomodoro' ? 'Pomodoro' : mode === 'countdown' ? 'Temporizador' : 'Cronômetro');

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        color: '#f8fafc',
        gap: '8px',
        fontSize: '12px',
      }}
    >
      {/* Mode Tabs */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          background: '#0f172a',
          padding: '3px',
          borderRadius: '8px',
          border: '1px solid #334155',
          gap: '2px',
          flexShrink: 0,
        }}
      >
        {([
          { id: 'pomodoro', label: 'Pomodoro', icon: <Bell size={11} /> },
          { id: 'countdown', label: 'Contagem', icon: <Hourglass size={11} /> },
          { id: 'stopwatch', label: 'Crono', icon: <AlarmClock size={11} /> },
        ] as { id: TimerMode; label: string; icon: React.ReactNode }[]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              if (isRunning) return;
              setMode(tab.id);
              setIsRunning(false);
              setShowSettings(false);
            }}
            disabled={isRunning}
            style={{
              flex: 1,
              background: mode === tab.id ? getPhaseColor() + '30' : 'transparent',
              border: `1px solid ${mode === tab.id ? getPhaseColor() + '60' : 'transparent'}`,
              color: mode === tab.id ? '#f8fafc' : '#64748b',
              borderRadius: '5px',
              padding: '5px 2px',
              cursor: isRunning ? 'not-allowed' : 'pointer',
              fontSize: '10px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              transition: 'all 0.2s',
              opacity: isRunning ? 0.6 : 1,
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Title + edit */}
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        {isEditingTitle ? (
          <input
            autoFocus
            value={config.customTitle}
            onChange={(e) => setConfig({ ...config, customTitle: e.target.value })}
            onBlur={async () => {
              setIsEditingTitle(false);
              await context.storage.set('config', config);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                setIsEditingTitle(false);
                context.storage.set('config', config);
              }
            }}
            placeholder="Nome do timer..."
            style={{
              flex: 1,
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '4px',
              color: '#f8fafc',
              fontSize: '11px',
              padding: '3px 6px',
              outline: 'none',
            }}
          />
        ) : (
          <span
            style={{
              fontWeight: 600,
              color: getPhaseColor(),
              background: `${getPhaseColor()}20`,
              padding: '2px 8px',
              borderRadius: '12px',
              border: `1px solid ${getPhaseColor()}40`,
              fontSize: '11px',
              maxWidth: '160px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {mode === 'pomodoro' ? getPomodoroPhaseLabel() : displayTitle}
          </span>
        )}

        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => setIsEditingTitle(!isEditingTitle)}
            title="Editar nome do timer"
            style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '3px' }}
          >
            <Edit2 size={12} />
          </button>
          {mode === 'pomodoro' && (
            <button
              onClick={() => setShowSettings(!showSettings)}
              style={{ background: 'transparent', border: 'none', color: showSettings ? '#38bdf8' : '#64748b', cursor: 'pointer', padding: '3px' }}
              title="Configurações"
            >
              <Settings size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Settings panel (Pomodoro only) */}
      {showSettings && mode === 'pomodoro' ? (
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
          <div style={{ fontWeight: 600, color: '#f8fafc', marginBottom: '2px' }}>Tempos (min)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <label>Foco:
              <input type="number" min="1" max="120" value={config.focusMinutes}
                onChange={(e) => setConfig({ ...config, focusMinutes: parseInt(e.target.value) || 1 })}
                style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px', padding: '3px' }} />
            </label>
            <label>Pausa Curta:
              <input type="number" min="1" max="60" value={config.shortBreakMinutes}
                onChange={(e) => setConfig({ ...config, shortBreakMinutes: parseInt(e.target.value) || 1 })}
                style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px', padding: '3px' }} />
            </label>
            <label>Pausa Longa:
              <input type="number" min="1" max="60" value={config.longBreakMinutes}
                onChange={(e) => setConfig({ ...config, longBreakMinutes: parseInt(e.target.value) || 1 })}
                style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px', padding: '3px' }} />
            </label>
            <label>Ciclos p/ Long:
              <input type="number" min="1" max="10" value={config.cyclesUntilLongBreak}
                onChange={(e) => setConfig({ ...config, cyclesUntilLongBreak: parseInt(e.target.value) || 1 })}
                style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px', padding: '3px' }} />
            </label>
          </div>
          <button
            onClick={() => updateSettings(config)}
            style={{ marginTop: 'auto', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px', cursor: 'pointer', fontWeight: 600 }}
          >
            Salvar
          </button>
        </div>
      ) : (
        <>
          {/* Countdown input */}
          {mode === 'countdown' && !isRunning && countdownRemaining === countdownInitialSecs && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <input
                type="number"
                min="0"
                max="999"
                value={countdownMinutes}
                onChange={(e) => setCountdownMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                style={{ width: '48px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px', padding: '4px', textAlign: 'center', fontSize: '13px' }}
              />
              <span style={{ color: '#64748b', fontWeight: 700 }}>:</span>
              <input
                type="number"
                min="0"
                max="59"
                value={countdownSeconds}
                onChange={(e) => setCountdownSeconds(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                style={{ width: '48px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px', padding: '4px', textAlign: 'center', fontSize: '13px' }}
              />
              <button
                onClick={applyCountdownInput}
                style={{ background: '#0284c7', color: '#fff', border: 'none', borderRadius: '5px', padding: '4px 8px', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}
              >
                OK
              </button>
            </div>
          )}

          {/* Progress Circle / Display */}
          <div
            style={{
              position: 'relative',
              width: '110px',
              height: '110px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: 'auto',
              flexShrink: 0,
            }}
          >
            {mode !== 'stopwatch' && (
              <svg width="110" height="110" style={{ transform: 'rotate(-90deg)', position: 'absolute' }}>
                <circle cx="55" cy="55" r="48" stroke="#334155" strokeWidth="5" fill="transparent" />
                <circle
                  cx="55" cy="55" r="48"
                  stroke={getPhaseColor()}
                  strokeWidth="5"
                  fill="transparent"
                  strokeDasharray={2 * Math.PI * 48}
                  strokeDashoffset={2 * Math.PI * 48 * (1 - progressPercent / 100)}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                />
              </svg>
            )}

            <div style={{ textAlign: 'center', zIndex: 1 }}>
              {mode === 'stopwatch' ? (
                <>
                  <div style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.5px', color: getPhaseColor() }}>
                    {formatStopwatch(stopwatchMs)}
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>cronômetro</div>
                </>
              ) : (
                <span style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.5px' }}>
                  {mode === 'countdown' ? formatTime(countdownRemaining) : formatTime(remainingSeconds)}
                </span>
              )}
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            <button
              onClick={resetTimer}
              title="Resetar"
              style={{ background: 'rgba(51, 65, 85, 0.5)', border: 'none', color: '#94a3b8', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <RotateCcw size={14} />
            </button>

            <button
              onClick={togglePlay}
              title={isRunning ? 'Pausar' : 'Iniciar'}
              style={{ background: getPhaseColor(), border: 'none', color: '#ffffff', borderRadius: '50%', width: '44px', height: '44px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 14px ${getPhaseColor()}50`, transition: 'all 0.2s' }}
            >
              {isRunning ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: '2px' }} />}
            </button>

            {mode === 'pomodoro' && (
              <button
                onClick={skipPhase}
                title="Pular fase"
                style={{ background: 'rgba(51, 65, 85, 0.5)', border: 'none', color: '#94a3b8', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <SkipForward size={14} />
              </button>
            )}
          </div>

          {/* Footer */}
          {mode === 'pomodoro' && (
            <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              <CheckCircle size={12} color="#10b981" />
              <span>Ciclos: <strong style={{ color: '#f8fafc' }}>{completedCycles}</strong></span>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const pomodoroWidget: WidgetDefinition = {
  manifest: {
    id: 'pomodoro',
    name: 'Timer Multiferramenta',
    version: '2.0.0',
    description: 'Pomodoro, contagem regressiva e cronômetro em um só widget, com nome/título customizável e notificações.',
    icon: 'Timer',
    author: 'Dashboard Core',
    status: 'stable',
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 2, h: 3 },
    maxSize: { w: 6, h: 4 },
    requiresAgent: false,
  },
  component: TimerWidget,
};
