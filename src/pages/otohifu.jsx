import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function Otohifu() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [frequency, setFrequency] = useState(440);
  const [waveform, setWaveform] = useState('sine'); // 波形の状態を追加

  const audioCtxRef = useRef(null);
  const oscillatorRef = useRef(null);
  const gainNodeRef = useRef(null);
  const trackRef = useRef(null);

  // --- Web Audio API の制御 ---
  useEffect(() => {
    return () => {
      if (oscillatorRef.current) {
        oscillatorRef.current.stop();
        oscillatorRef.current.disconnect();
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close();
      }
    };
  }, []);

  const playSound = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // 選択されている波形をセット
    osc.type = waveform;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    
    // 波形ごとの音量調整（サイン波以外は倍音が多くてうるさいため下げる）
    const volume = waveform === 'sine' ? 0.3 : 0.15;
    gain.gain.setValueAtTime(volume, ctx.currentTime);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();

    oscillatorRef.current = osc;
    gainNodeRef.current = gain;
    setIsPlaying(true);
  };

  const stopSound = () => {
    if (oscillatorRef.current) {
      oscillatorRef.current.stop();
      oscillatorRef.current.disconnect();
      oscillatorRef.current = null;
    }
    setIsPlaying(false);
  };

  const handleToggle = () => {
    if (isPlaying) stopSound();
    else playSound();
  };

  // --- 波形の変更処理 ---
  const handleWaveformChange = (e) => {
    const newWave = e.target.value;
    setWaveform(newWave);
    
    // 再生中の場合は即座に波形と音量を反映
    if (oscillatorRef.current) {
      oscillatorRef.current.type = newWave;
      if (gainNodeRef.current && audioCtxRef.current) {
        const volume = newWave === 'sine' ? 0.3 : 0.15;
        gainNodeRef.current.gain.setTargetAtTime(volume, audioCtxRef.current.currentTime, 0.1);
      }
    }
  };

  // --- カスタムフェーダーのロジック ---
  const updateFrequencyFromPointer = (clientY) => {
    if (!trackRef.current) return;
    
    const rect = trackRef.current.getBoundingClientRect();
    let y = Math.max(0, Math.min(clientY - rect.top, rect.height));
    const percent = 1 - (y / rect.height);
    
    const minFreq = 100;
    const maxFreq = 2000;
    const newFreq = Math.round(minFreq + percent * (maxFreq - minFreq));
    
    setFrequency(newFreq);

    if (isPlaying && oscillatorRef.current && audioCtxRef.current) {
      oscillatorRef.current.frequency.setValueAtTime(newFreq, audioCtxRef.current.currentTime);
    }
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    updateFrequencyFromPointer(e.clientY);

    const handlePointerMove = (moveEvent) => {
      updateFrequencyFromPointer(moveEvent.clientY);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const thumbPositionPercent = ((frequency - 100) / (2000 - 100)) * 100;

  return (
    <div className="bg-zinc-800 p-6 rounded-xl shadow-2xl w-56 flex flex-col items-center gap-6 mx-auto mt-10 border border-zinc-700 select-none relative">
      <div className="w-full flex justify-start -mb-2.5">
        <Link to="/" className="text-xs bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 transition-colors">
            ← Back
        </Link>
      </div>
      
      {/* LED風モニター */}
      <div className="w-full bg-black border-2 border-zinc-900 rounded-md p-2 shadow-inner flex flex-col items-center justify-center">
        <span className="text-[10px] text-zinc-500 font-mono tracking-widest mb-1">FREQ (Hz)</span>
        <span className="font-mono text-3xl font-bold text-red-500 tracking-wider drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]">
          {frequency.toString().padStart(4, '0')}
        </span>
      </div>

      {/* 縦型カスタムフェーダー */}
      <div className="relative h-64 w-full flex justify-center items-center">
        <div className="absolute left-2 h-full flex flex-col justify-between py-1 text-[10px] text-zinc-400 font-mono pointer-events-none">
          <span>MAX</span>
          <span>-</span>
          <span>-</span>
          <span>-</span>
          <span>MIN</span>
        </div>

        <div 
          ref={trackRef}
          className="relative h-full w-12 flex justify-center cursor-pointer touch-none"
          onPointerDown={handlePointerDown}
        >
          <div className="absolute w-2 h-full bg-black rounded-full shadow-inner pointer-events-none"></div>
          <div 
            className="absolute w-14 h-6 bg-zinc-300 border-x-4 border-zinc-400 rounded-sm shadow-[0_4px_6px_rgba(0,0,0,0.5)] flex items-center justify-center transition-none pointer-events-none"
            style={{ 
              bottom: `${thumbPositionPercent}%`, 
              transform: 'translateY(50%)' 
            }}
          >
            <div className="w-8 h-1 bg-zinc-500 rounded-full"></div>
          </div>
        </div>
      </div>

      {/* 波形セレクター */}
      <div className="w-full flex flex-col gap-1">
        <label className="text-[10px] text-zinc-400 font-mono tracking-wider">WAVEFORM</label>
        <select 
          value={waveform}
          onChange={handleWaveformChange}
          className="w-full bg-zinc-900 text-zinc-300 border border-zinc-600 p-2 rounded text-sm font-mono focus:outline-none focus:border-red-500 transition-colors cursor-pointer"
        >
          <option value="sine">Sine</option>
          <option value="square">Square</option>
          <option value="sawtooth">Sawtooth</option>
          <option value="triangle">Triangle</option>
        </select>
      </div>

      {/* CH ON/OFF ボタン */}
      <button
        onClick={handleToggle}
        className={`w-full py-3 font-bold text-sm tracking-wider rounded transition-all duration-200 shadow-md ${
          isPlaying 
            ? 'bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.6)] hover:bg-green-400' 
            : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600 border border-zinc-600 shadow-inner'
        }`}
      >
        {isPlaying ? 'CH ON' : 'CH OFF'}
      </button>

    </div>
  );
}