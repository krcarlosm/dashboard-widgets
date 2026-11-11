import React, { useCallback, useEffect, useState, useRef } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { Play, Pause, RotateCcw, SkipForward, Settings, Bell, CheckCircle, AlarmClock, Hourglass, Edit2, Target, X } from 'lucide-react';
import { IconButton, SegmentedControl } from '../../ui';
import { MenuItem, MenuNote, MenuPopover } from '../../ui/MenuPopover';
import { showToast } from '../../ui/toast';
import { alpha } from '../../theme/tokens';
import { formatFocus, type SharedTask } from '../../sdk/actions';

/** Tarefa do Todo/Kanban que recebe o tempo de cada ciclo de foco. */
export interface FocusTask {
  instanceId: string;
  itemId: string;
  text: string;
}

interface TaskGroup {
  instanceId: string;
  title: string;
  tasks: SharedTask[];
}

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

  // O tempo é sempre calculado pelo relógio, não pela contagem de "ticks": abas em
  // segundo plano têm timers estrangulados e o computador pode suspender.
  const deadlineRef = useRef<number>(0); // Pomodoro/contagem: instante em que chega a zero
  const stopwatchStartRef = useRef<number>(0); // Cronômetro: instante equivalente ao zero
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // Title editing
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);

  const workerRef = useRef<Worker | null>(null);

  // Tarefa em foco (Lista de Tarefas / Kanban)
  const [focusTask, setFocusTask] = useState<FocusTask | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [taskGroups, setTaskGroups] = useState<TaskGroup[] | null>(null);
  const pickerButtonRef = useRef<HTMLButtonElement>(null);
  const closePicker = useCallback(() => setPickerOpen(false), []);

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
      const savedFocusTask = await context.storage.get<FocusTask | null>('focusTask', null);

      setMode(savedMode || 'pomodoro');
      setConfig(savedConfig || DEFAULT_CONFIG);
      setPhase(savedPhase || 'focus');
      setCompletedCycles(savedCycles || 0);
      setRemainingSeconds(savedSecs !== undefined ? savedSecs : (savedConfig?.focusMinutes || 25) * 60);
      setCountdownInitialSecs(savedCdInitial || 600);
      setCountdownRemaining(savedCdRemaining !== undefined ? savedCdRemaining : 600);
      setCountdownMinutes(Math.floor((savedCdInitial || 600) / 60));
      setCountdownSeconds((savedCdInitial || 600) % 60);
      setFocusTask(savedFocusTask ?? null);
      setIsLoaded(true);
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
        const left = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
        if (mode === 'pomodoro') {
          setRemainingSeconds(left);
        } else if (mode === 'countdown') {
          setCountdownRemaining(left);
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
        deadlineRef.current = Date.now() + (mode === 'pomodoro' ? remainingSeconds : countdownRemaining) * 1000;
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
        stopwatchStartRef.current = Date.now() - stopwatchMs;
        stopwatchIntervalRef.current = setInterval(() => {
          setStopwatchMs(Date.now() - stopwatchStartRef.current);
        }, 50);
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

  // ── Save state ── (só depois de carregar, para não sobrescrever o salvo com os padrões)
  useEffect(() => {
    if (!isLoaded) return;
    context.storage.set('mode', mode);
    context.storage.set('remainingSeconds', remainingSeconds);
    context.storage.set('phase', phase);
    context.storage.set('completedCycles', completedCycles);
    context.storage.set('countdownInitialSecs', countdownInitialSecs);
    context.storage.set('countdownRemaining', countdownRemaining);
  }, [isLoaded, mode, remainingSeconds, phase, completedCycles, countdownInitialSecs, countdownRemaining]);

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

  const chooseFocusTask = async (task: FocusTask | null) => {
    setPickerOpen(false);
    setFocusTask(task);
    await context.storage.set('focusTask', task);
  };

  const openPicker = async () => {
    if (pickerOpen) {
      setPickerOpen(false);
      return;
    }
    setTaskGroups(null);
    setPickerOpen(true);
    const sources = context.actions.targets(['task']);
    const groups = await Promise.all(
      sources.map(async (source) => ({
        instanceId: source.instanceId,
        title: source.title,
        tasks: ((await context.actions.request<SharedTask[]>(source.instanceId, { type: 'tasks:list' })) ?? []).filter((task) => !task.done),
      })),
    );
    setTaskGroups(groups);
  };

  /** Ao fim de um ciclo de foco, o tempo vai para a tarefa escolhida. */
  const recordFocusTime = (seconds: number) => {
    if (!focusTask) return;
    const task = focusTask;
    context.actions
      .send(task.instanceId, { kind: 'task:time', itemId: task.itemId, seconds })
      .then(() => showToast(`${formatFocus(seconds)} registrados em "${task.text}".`))
      .catch(() => showToast('Não foi possível registrar o tempo na tarefa.', 'danger'));
  };

  const handlePomodoroPhaseComplete = () => {
    setIsRunning(false);
    workerRef.current?.postMessage('stop');
    const displayTitle = config.customTitle || 'Pomodoro';

    if (phase === 'focus') {
      recordFocusTime(config.focusMinutes * 60);
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
    setIsRunning(false);
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
    if (mode === 'stopwatch') return 'var(--app-warning)';
    if (mode === 'countdown') return 'var(--widget-accent)';
    if (phase === 'focus') return 'var(--app-danger)';
    if (phase === 'short_break') return 'var(--widget-accent)';
    return 'var(--app-success)';
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
        color: 'var(--app-text)',
        gap: '8px',
        fontSize: '12px',
      }}
    >
      {/* Mode Tabs */}
      <SegmentedControl
        stretch
        ariaLabel="Modo do timer"
        disabled={isRunning}
        value={mode}
        onChange={(next) => {
          if (isRunning) return;
          setMode(next);
          setIsRunning(false);
          setShowSettings(false);
        }}
        options={[
          { id: 'pomodoro', label: 'Pomodoro', icon: <Bell size={11} /> },
          { id: 'countdown', label: 'Contagem', icon: <Hourglass size={11} /> },
          { id: 'stopwatch', label: 'Crono', icon: <AlarmClock size={11} /> },
        ]}
      />

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
              background: 'var(--app-input)',
              border: '1px solid var(--app-border)',
              borderRadius: '4px',
              color: 'var(--app-text)',
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
              background: alpha(getPhaseColor(), 14),
              padding: '2px 8px',
              borderRadius: '12px',
              border: `1px solid ${alpha(getPhaseColor(), 40)}`,
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
            aria-label="Editar nome do timer"
            style={{ background: 'transparent', border: 'none', color: 'var(--app-muted-strong)', cursor: 'pointer', padding: '3px' }}
          >
            <Edit2 size={12} />
          </button>
          {mode === 'pomodoro' && (
            <button
              onClick={() => setShowSettings(!showSettings)}
              style={{ background: 'transparent', border: 'none', color: showSettings ? 'var(--widget-accent)' : 'var(--app-muted-strong)', cursor: 'pointer', padding: '3px' }}
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
            background: 'var(--app-surface-elevated)',
            padding: '10px',
            borderRadius: '8px',
            border: '1px solid var(--app-border)',
            fontSize: '11px',
          }}
        >
          <div style={{ fontWeight: 600, color: 'var(--app-text)', marginBottom: '2px' }}>Tempos (min)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <label>Foco:
              <input type="number" min="1" max="120" value={config.focusMinutes}
                onChange={(e) => setConfig({ ...config, focusMinutes: parseInt(e.target.value) || 1 })}
                style={{ width: '100%', background: 'var(--app-input)', border: '1px solid var(--app-border)', color: 'var(--app-text)', borderRadius: '4px', padding: '3px' }} />
            </label>
            <label>Pausa Curta:
              <input type="number" min="1" max="60" value={config.shortBreakMinutes}
                onChange={(e) => setConfig({ ...config, shortBreakMinutes: parseInt(e.target.value) || 1 })}
                style={{ width: '100%', background: 'var(--app-input)', border: '1px solid var(--app-border)', color: 'var(--app-text)', borderRadius: '4px', padding: '3px' }} />
            </label>
            <label>Pausa Longa:
              <input type="number" min="1" max="60" value={config.longBreakMinutes}
                onChange={(e) => setConfig({ ...config, longBreakMinutes: parseInt(e.target.value) || 1 })}
                style={{ width: '100%', background: 'var(--app-input)', border: '1px solid var(--app-border)', color: 'var(--app-text)', borderRadius: '4px', padding: '3px' }} />
            </label>
            <label>Ciclos p/ Long:
              <input type="number" min="1" max="10" value={config.cyclesUntilLongBreak}
                onChange={(e) => setConfig({ ...config, cyclesUntilLongBreak: parseInt(e.target.value) || 1 })}
                style={{ width: '100%', background: 'var(--app-input)', border: '1px solid var(--app-border)', color: 'var(--app-text)', borderRadius: '4px', padding: '3px' }} />
            </label>
          </div>
          <button
            onClick={() => updateSettings(config)}
            style={{ marginTop: 'auto', background: 'var(--widget-accent-strong)', color: 'var(--app-on-accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '6px', cursor: 'pointer', fontWeight: 600 }}
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
                aria-label="Minutos"
                value={countdownMinutes}
                onChange={(e) => setCountdownMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                style={{ width: '48px', background: 'var(--app-input)', border: '1px solid var(--app-border)', color: 'var(--app-text)', borderRadius: '4px', padding: '4px', textAlign: 'center', fontSize: '13px' }}
              />
              <span style={{ color: 'var(--app-muted-strong)', fontWeight: 700 }}>:</span>
              <input
                type="number"
                min="0"
                max="59"
                aria-label="Segundos"
                value={countdownSeconds}
                onChange={(e) => setCountdownSeconds(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                style={{ width: '48px', background: 'var(--app-input)', border: '1px solid var(--app-border)', color: 'var(--app-text)', borderRadius: '4px', padding: '4px', textAlign: 'center', fontSize: '13px' }}
              />
              <button
                onClick={applyCountdownInput}
                style={{ background: 'var(--widget-accent-strong)', color: 'var(--app-on-accent)', border: 'none', borderRadius: '5px', padding: '4px 8px', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}
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
                <circle cx="55" cy="55" r="48" stroke="var(--app-border)" strokeWidth="5" fill="transparent" />
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
                  <div style={{ fontSize: '10px', color: 'var(--app-muted-strong)', marginTop: '2px' }}>cronômetro</div>
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
              style={{ background: 'var(--app-surface-elevated)', border: 'none', color: 'var(--app-muted)', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <RotateCcw size={14} />
            </button>

            <button
              onClick={togglePlay}
              title={isRunning ? 'Pausar' : 'Iniciar'}
              style={{ background: getPhaseColor(), border: 'none', color: 'var(--app-on-accent)', borderRadius: '50%', width: '44px', height: '44px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 14px ${alpha(getPhaseColor(), 35)}`, transition: 'all 0.2s' }}
            >
              {isRunning ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: '2px' }} />}
            </button>

            {mode === 'pomodoro' && (
              <button
                onClick={skipPhase}
                title="Pular fase"
                style={{ background: 'var(--app-surface-elevated)', border: 'none', color: 'var(--app-muted)', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <SkipForward size={14} />
              </button>
            )}
          </div>

          {/* Footer */}
          {mode === 'pomodoro' && (
            <div style={{ width: '100%', fontSize: '11px', color: 'var(--app-muted-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexShrink: 0, minWidth: 0 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                <CheckCircle size={12} color="var(--app-success)" />
                <span>Ciclos: <strong style={{ color: 'var(--app-text)' }}>{completedCycles}</strong></span>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', minWidth: 0 }}>
                <button
                  ref={pickerButtonRef}
                  type="button"
                  onClick={() => void openPicker()}
                  aria-haspopup="menu"
                  aria-expanded={pickerOpen}
                  title={focusTask ? `Em foco: ${focusTask.text} (clique para trocar)` : 'Escolher a tarefa em foco (Lista de Tarefas ou Kanban)'}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', minWidth: 0, background: 'transparent', border: 'none', padding: '1px 2px', cursor: 'pointer', color: focusTask ? 'var(--app-text)' : 'var(--widget-accent)', fontSize: '11px' }}
                >
                  <Target size={12} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{focusTask ? focusTask.text : 'Tarefa em foco'}</span>
                </button>
                {focusTask && <IconButton label="Tirar tarefa do foco" icon={<X size={11} />} onClick={() => void chooseFocusTask(null)} style={{ padding: 0 }} />}
              </span>
              <MenuPopover anchorRef={pickerButtonRef} open={pickerOpen} onClose={closePicker} label="Tarefa em foco" width={240}>
                {taskGroups === null ? (
                  <MenuNote>Buscando tarefas…</MenuNote>
                ) : taskGroups.length === 0 ? (
                  <MenuNote>Adicione uma Lista de Tarefas ou um Kanban ao canvas para escolher a tarefa em foco.</MenuNote>
                ) : taskGroups.every((group) => group.tasks.length === 0) ? (
                  <MenuNote>Nenhuma tarefa pendente.</MenuNote>
                ) : (
                  taskGroups.map((group) =>
                    group.tasks.length === 0 ? null : (
                      <React.Fragment key={group.instanceId}>
                        {taskGroups.length > 1 && <MenuNote>{group.title}</MenuNote>}
                        {group.tasks.map((task) => (
                          <MenuItem key={task.id} title={task.text} onSelect={() => void chooseFocusTask({ instanceId: group.instanceId, itemId: task.id, text: task.text })}>
                            {task.text}
                            {task.focusSeconds ? ` · ${formatFocus(task.focusSeconds)}` : ''}
                          </MenuItem>
                        ))}
                      </React.Fragment>
                    ),
                  )
                )}
              </MenuPopover>
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
    version: '2.1.0',
    description: 'Pomodoro, contagem regressiva e cronômetro em um só widget, com tarefa em foco (registra o tempo no Todo/Kanban) e notificações.',
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
