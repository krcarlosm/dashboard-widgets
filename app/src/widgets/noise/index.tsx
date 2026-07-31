import React, { useEffect, useState, useRef } from 'react';
import { WidgetDefinition, WidgetComponentProps } from '../../sdk/types';
import { Volume2, VolumeX, Play, Pause, Radio } from 'lucide-react';

type NoiseType = 'white' | 'brown' | 'pink';

const NoiseWidget: React.FC<WidgetComponentProps> = ({ context }) => {
  const [noiseType, setNoiseType] = useState<NoiseType>('white');
  const [volume, setVolume] = useState<number>(50); // 0 to 100
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Load saved state
  useEffect(() => {
    async function loadData() {
      const savedType = await context.storage.get<NoiseType>('noiseType', 'white');
      const savedVol = await context.storage.get<number>('volume', 50);
      setNoiseType(savedType || 'white');
      setVolume(savedVol !== undefined ? savedVol : 50);
    }
    loadData();
  }, [context.storage]);

  // Handle cleanup on unmount/destroy
  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, []);

  const createNoiseBuffer = (ctx: AudioContext, type: NoiseType): AudioBuffer => {
    const bufferSize = 5 * ctx.sampleRate; // 5 seconds buffer
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
        data[i] *= 3.5; // Boost amplitude for brown noise
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

  const startAudio = () => {
    stopAudio();

    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtxClass();
    audioCtxRef.current = ctx;

    const gainNode = ctx.createGain();
    const targetGain = (volume / 100) * 0.5;
    gainNode.gain.setValueAtTime(0.001, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.001, targetGain), ctx.currentTime + 0.2); // 200ms fade in
    gainNodeRef.current = gainNode;

    const buffer = createNoiseBuffer(ctx, noiseType);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);

    sourceNodeRef.current = source;
    setIsPlaying(true);
  };

  const stopAudio = () => {
    if (gainNodeRef.current && audioCtxRef.current) {
      try {
        const ctx = audioCtxRef.current;
        gainNodeRef.current.gain.setValueAtTime(gainNodeRef.current.gain.value, ctx.currentTime);
        gainNodeRef.current.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15); // 150ms fade out
      } catch {}
    }

    setTimeout(() => {
      try {
        sourceNodeRef.current?.stop();
        sourceNodeRef.current?.disconnect();
        audioCtxRef.current?.close();
      } catch {}
      sourceNodeRef.current = null;
      gainNodeRef.current = null;
      audioCtxRef.current = null;
      setIsPlaying(false);
    }, 160);
  };

  const togglePlay = () => {
    if (isPlaying) {
      stopAudio();
    } else {
      startAudio();
    }
  };

  const handleTypeChange = async (type: NoiseType) => {
    setNoiseType(type);
    await context.storage.set('noiseType', type);
    if (isPlaying) {
      startAudio(); // Restart with new noise buffer
    }
  };

  const handleVolumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setVolume(val);
    await context.storage.set('volume', val);

    if (gainNodeRef.current && audioCtxRef.current) {
      const targetGain = (val / 100) * 0.5;
      gainNodeRef.current.gain.setValueAtTime(Math.max(0.001, targetGain), audioCtxRef.current.currentTime);
    }
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
        gap: '12px',
        fontSize: '12px',
      }}
    >
      {/* Noise Type Selector */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          width: '100%',
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
              background: noiseType === type ? '#0284c7' : 'transparent',
              color: noiseType === type ? '#ffffff' : '#94a3b8',
              border: 'none',
              borderRadius: '6px',
              padding: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              textTransform: 'capitalize',
              transition: 'all 0.2s',
            }}
          >
            {type === 'white' ? 'White' : type === 'brown' ? 'Brown' : 'Pink'}
          </button>
        ))}
      </div>

      {/* Main Play/Pause Button */}
      <button
        onClick={togglePlay}
        style={{
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          background: isPlaying
            ? 'linear-gradient(135deg, #0284c7, #38bdf8)'
            : 'rgba(51, 65, 85, 0.6)',
          border: 'none',
          color: '#ffffff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isPlaying ? '0 0 24px rgba(56, 189, 248, 0.4)' : 'none',
          transition: 'all 0.3s ease',
        }}
      >
        {isPlaying ? <Pause size={32} /> : <Play size={32} style={{ marginLeft: '4px' }} />}
      </button>

      {/* Volume Slider */}
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {volume === 0 ? <VolumeX size={16} color="#64748b" /> : <Volume2 size={16} color="#38bdf8" />}
        <input
          type="range"
          min="0"
          max="100"
          value={volume}
          onChange={handleVolumeChange}
          style={{
            flex: 1,
            accentColor: '#38bdf8',
            cursor: 'pointer',
          }}
        />
        <span style={{ width: '28px', textAlign: 'right', fontSize: '11px', color: '#94a3b8' }}>
          {volume}%
        </span>
      </div>
    </div>
  );
};

export const noiseWidget: WidgetDefinition = {
  manifest: {
    id: 'noise',
    name: 'Gerador de Ruído',
    version: '1.0.0',
    description: 'Sintetizador procedural de ruído branco, marrom e rosa via Web Audio API.',
    icon: 'Radio',
    author: 'Dashboard Core',
    status: 'stable',
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 3 },
    maxSize: { w: 6, h: 5 },
    requiresAgent: false,
  },
  component: NoiseWidget,
};
