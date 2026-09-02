import React, { useEffect, useState, useRef } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { Volume2, VolumeX, Play, Pause, Settings, Timer, Clock, Check } from 'lucide-react';

type NoiseType = 'white' | 'brown' | 'pink';

const NoiseWidget: React.FC<WidgetComponentProps> = ({ context }) => {
  const [noiseType, setNoiseType] = useState<NoiseType>('white');
  const [volume, setVolume] = useState<number>(50); // 0 to 100
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Timer states
  const [isTimerEnabled, setIsTimerEnabled] = useState<boolean>(false);
  const [selectedMinutes, setSelectedMinutes] = useState<number>(15);
  const [customMinutesInput, setCustomMinutesInput] = useState<string>('10');
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const isStartingRef = useRef<boolean>(false);
  const timerIntervalRef = useRef<number | null>(null);

  // Load saved state
  useEffect(() => {
    async function loadData() {
      const savedType = await context.storage.get<NoiseType>('noiseType', 'white');
      const savedVol = await context.storage.get<number>('volume', 50);
      const savedTimerEnabled = await context.storage.get<boolean>('isTimerEnabled', false);
      const savedMinutes = await context.storage.get<number>('selectedMinutes', 15);

      setNoiseType(savedType || 'white');
      setVolume(savedVol !== undefined ? savedVol : 50);
      setIsTimerEnabled(!!savedTimerEnabled);
      setSelectedMinutes(savedMinutes || 15);
    }
    loadData();
  }, [context.storage]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      clearTimerInterval();
      cleanupAudio();
    };
  }, []);

  const clearTimerInterval = () => {
    if (timerIntervalRef.current !== null) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const createNoiseBuffer = (ctx: AudioContext, type: NoiseType): AudioBuffer => {
    const bufferSize = 30 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    if (type === 'white') {
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    } else if (type === 'brown') {
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = data[i];
        data[i] *= 3.5;
      }
    } else if (type === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        data[i] *= 0.11;
        b6 = white * 0.115926;
      }
    }

    return buffer;
  };

  const cleanupAudio = () => {
    try {
      sourceNodeRef.current?.stop();
      sourceNodeRef.current?.disconnect();
    } catch { /* already stopped */ }
    try {
      gainNodeRef.current?.disconnect();
      audioCtxRef.current?.close();
    } catch { /* already closed */ }
    sourceNodeRef.current = null;
    gainNodeRef.current = null;
    audioCtxRef.current = null;
  };

  const startTimer = (durationMinutes: number) => {
    clearTimerInterval();
    const totalSecs = Math.max(1, Math.round(durationMinutes * 60));
    setRemainingSeconds(totalSecs);

    let secs = totalSecs;
    timerIntervalRef.current = window.setInterval(() => {
      secs -= 1;
      if (secs <= 0) {
        setRemainingSeconds(0);
        clearTimerInterval();
        stopAudio();
      } else {
        setRemainingSeconds(secs);
      }
    }, 1000);
  };

  const startAudio = async (type: NoiseType, vol: number) => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    cleanupAudio();

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtxClass();
      audioCtxRef.current = ctx;

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const gainNode = ctx.createGain();
      const targetGain = Math.max(0.0001, (vol / 100) * 0.6);
      gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(targetGain, ctx.currentTime + 0.3);
      gainNodeRef.current = gainNode;

      const buffer = createNoiseBuffer(ctx, type);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      source.start(0);
      sourceNodeRef.current = source;

      setIsPlaying(true);

      if (isTimerEnabled) {
        startTimer(selectedMinutes);
      } else {
        clearTimerInterval();
        setRemainingSeconds(null);
      }
    } catch (err) {
      console.error('[NoiseWidget] Error starting audio:', err);
      cleanupAudio();
      clearTimerInterval();
      setIsPlaying(false);
      setRemainingSeconds(null);
    } finally {
      isStartingRef.current = false;
    }
  };

  const stopAudio = () => {
    clearTimerInterval();
    setRemainingSeconds(null);

    if (!gainNodeRef.current || !audioCtxRef.current) {
      setIsPlaying(false);
      return;
    }

    try {
      const ctx = audioCtxRef.current;
      const gain = gainNodeRef.current;
      const currentVal = Math.max(0.0001, gain.gain.value);
      gain.gain.setValueAtTime(currentVal, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
    } catch { /* ignore */ }

    setTimeout(() => {
      cleanupAudio();
      setIsPlaying(false);
    }, 220);
  };

  const togglePlay = async () => {
    if (isPlaying) {
      stopAudio();
    } else {
      await startAudio(noiseType, volume);
    }
  };

  const handleTypeChange = async (type: NoiseType) => {
    setNoiseType(type);
    await context.storage.set('noiseType', type);
    if (isPlaying) {
      stopAudio();
      setTimeout(() => startAudio(type, volume), 300);
    }
  };

  const handleVolumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setVolume(val);
    await context.storage.set('volume', val);

    if (gainNodeRef.current && audioCtxRef.current) {
      const targetGain = Math.max(0.0001, (val / 100) * 0.6);
      gainNodeRef.current.gain.setValueAtTime(targetGain, audioCtxRef.current.currentTime);
    }
  };

  const handleToggleTimer = async (enabled: boolean) => {
    setIsTimerEnabled(enabled);
    await context.storage.set('isTimerEnabled', enabled);

    if (isPlaying) {
      if (enabled) {
        startTimer(selectedMinutes);
      } else {
        clearTimerInterval();
        setRemainingSeconds(null);
      }
    }
  };

  const handleSelectMinutes = async (mins: number) => {
    setSelectedMinutes(mins);
    await context.storage.set('selectedMinutes', mins);
    if (isPlaying && isTimerEnabled) {
      startTimer(mins);
    }
  };

  const handleCustomMinutesChange = (val: string) => {
    setCustomMinutesInput(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) {
      handleSelectMinutes(parsed);
    }
  };

  const formatTimerDisplay = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const noiseLabels: Record<NoiseType, string> = {
    white: '⬜ White',
    brown: '🟫 Brown',
    pink: '🌸 Pink',
  };

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
        fontSize: '12px',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* Header Tabs + Settings Icon */}
      <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        <div
          style={{
            display: 'flex',
            gap: '3px',
            flex: 1,
            background: '#0f172a',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid #334155',
          }}
        >
          {(['white', 'brown', 'pink'] as NoiseType[]).map((type) => (
            <button
              key={type}
              onClick={() => handleTypeChange(type)}
              style={{
                flex: 1,
                background: noiseType === type ? 'var(--app-accent-strong)' : 'transparent',
                color: noiseType === type ? '#ffffff' : '#94a3b8',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 2px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {noiseLabels[type]}
            </button>
          ))}
        </div>

        {/* Settings button */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          title="Configurações de Temporizador"
          style={{
            background: showSettings ? 'var(--app-accent-soft)' : 'rgba(51, 65, 85, 0.4)',
            border: `1px solid ${showSettings ? 'var(--app-accent)' : 'rgba(51, 65, 85, 0.6)'}`,
            color: showSettings ? 'var(--app-accent)' : '#94a3b8',
            borderRadius: '8px',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'all 0.2s',
          }}
        >
          <Settings size={14} />
        </button>
      </div>

      {showSettings ? (
        /* Settings Panel View */
        <div
          style={{
            width: '100%',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '10px',
            gap: '8px',
            fontSize: '11px',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600, color: '#f8fafc' }}>
                <Timer size={14} color="var(--app-accent)" />
                <span>Temporizador Automático</span>
              </label>
              <input
                type="checkbox"
                checked={isTimerEnabled}
                onChange={(e) => handleToggleTimer(e.target.checked)}
                style={{ accentColor: 'var(--app-accent)', cursor: 'pointer', width: '15px', height: '15px' }}
              />
            </div>

            {isTimerEnabled ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
                <div style={{ fontSize: '10px', color: '#94a3b8' }}>Duração pré-definida:</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                  {[5, 15, 30, 60].map((mins) => (
                    <button
                      key={mins}
                      onClick={() => handleSelectMinutes(mins)}
                      style={{
                        background: selectedMinutes === mins ? 'var(--app-accent-strong)' : 'rgba(51, 65, 85, 0.5)',
                        color: selectedMinutes === mins ? '#ffffff' : '#94a3b8',
                        border: `1px solid ${selectedMinutes === mins ? 'var(--app-accent)' : 'rgba(51, 65, 85, 0.6)'}`,
                        borderRadius: '6px',
                        padding: '5px 0',
                        fontSize: '10px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {mins} min
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', fontSize: '11px', color: '#cbd5e1' }}>
                  <span>Customizado:</span>
                  <input
                    type="number"
                    min="1"
                    max="300"
                    value={customMinutesInput}
                    onChange={(e) => handleCustomMinutesChange(e.target.value)}
                    style={{
                      width: '50px',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '4px',
                      color: '#f8fafc',
                      padding: '3px 6px',
                      fontSize: '11px',
                      textAlign: 'center',
                    }}
                  />
                  <span>minutos</span>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', paddingTop: '4px' }}>
                Modo de reprodução contínua em loop infinito.
              </div>
            )}
          </div>

          <button
            onClick={() => setShowSettings(false)}
            style={{
              width: '100%',
              background: 'var(--app-accent-strong)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
            }}
          >
            <Check size={14} /> Concluído
          </button>
        </div>
      ) : (
        /* Main Player View */
        <>
          {/* Central Play/Pause Button & Timer Counter */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', flex: 1 }}>
            <button
              onClick={togglePlay}
              style={{
                width: '68px',
                height: '68px',
                borderRadius: '50%',
                background: isPlaying
                  ? 'linear-gradient(135deg, var(--app-accent-strong), var(--app-accent))'
                  : 'rgba(51, 65, 85, 0.6)',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isPlaying ? '0 0 24px var(--app-accent-border)' : 'none',
                transition: 'all 0.3s ease',
              }}
            >
              {isPlaying ? <Pause size={30} /> : <Play size={30} style={{ marginLeft: '4px' }} />}
            </button>

            {isPlaying && isTimerEnabled && remainingSeconds !== null && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--app-accent)',
                  background: 'var(--app-accent-soft)',
                  border: '1px solid var(--app-accent-border)',
                  padding: '2px 8px',
                  borderRadius: '12px',
                }}
              >
                <Clock size={11} />
                <span>{formatTimerDisplay(remainingSeconds)}</span>
              </div>
            )}
          </div>

          {/* Volume Slider */}
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {volume === 0 ? <VolumeX size={15} color="#4b84d4" /> : <Volume2 size={15} color="var(--app-accent)" />}
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={handleVolumeChange}
              style={{
                flex: 1,
                accentColor: 'var(--app-accent)',
                cursor: 'pointer',
              }}
            />
            <span style={{ width: '28px', textAlign: 'right', fontSize: '11px', color: '#94a3b8' }}>
              {volume}%
            </span>
          </div>
        </>
      )}
    </div>
  );
};

export const noiseWidget: WidgetDefinition = {
  manifest: {
    id: 'noise',
    name: 'Gerador de Ruído',
    version: '1.3.0',
    description: 'Sintetizador procedural de ruído branco, marrom e rosa com temporizador programável.',
    icon: 'Radio',
    author: 'Dashboard Core',
    status: 'stable',
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 2, h: 3 },
    maxSize: { w: 6, h: 5 },
    requiresAgent: false,
  },
  component: NoiseWidget,
};


