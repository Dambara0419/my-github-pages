import React, { useState, useRef, useEffect } from 'react';

export default function Otohifu() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [frequency, setFrequency] = useState(440);

  const audioCtxRef = useRef(null);
  const oscillatorRef = useRef(null);
  const gainNodeRef = useRef(null);

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

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);

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

  const handleFrequencyChange = (e) => {
    const newFreq = parseFloat(e.target.value);
    setFrequency(newFreq);

    if (isPlaying && oscillatorRef.current && audioCtxRef.current) {
      oscillatorRef.current.frequency.setValueAtTime(newFreq, audioCtxRef.current.currentTime);
    }
  };

  return (
    <div className="bg-zinc-800 p-6 rounded-xl shadow-2xl w-48 flex flex-col items-center gap-8 mx-auto mt-10 border border-zinc-700 select-none">
      
      {/* LED風の周波数ディスプレイ */}
      <div className="w-full bg-black border-2 border-zinc-900 rounded-md p-2 shadow-inner flex flex-col items-center justify-center">
        <span className="text-[10px] text-zinc-500 font-mono tracking-widest mb-1">FREQ (Hz)</span>
        <span className="font-mono text-2xl font-bold text-red-500 tracking-wider drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]">
          {frequency.toString().padStart(4, '0')}
        </span>
      </div>

      {/* 縦型フェーダー部分 */}
      <div className="relative h-64 w-full flex justify-center items-center">
        {/* フェーダーの溝（スリット） */}
        <div className="absolute w-2 h-full bg-black rounded-full shadow-inner pointer-events-none"></div>
        
        {/* メモリ（目盛り） */}
        <div className="absolute left-2 h-full flex flex-col justify-between py-2 text-[10px] text-zinc-400 font-mono pointer-events-none">
          <span>MAX</span>
          <span>-</span>
          <span>-</span>
          <span>-</span>
          <span>MIN</span>
        </div>

        {/* スライダー本体（-rotate-90で縦向きに配置） */}
        <input
          type="range"
          min="100"
          max="2000"
          step="1"
          value={frequency}
          onChange={handleFrequencyChange}
          // -rotate-90 によって、見た目の縦横が反転します
          // thumbの w-5 は画面上での「高さ」、h-14 は画面上での「幅」になります
          className="w-64 h-8 appearance-none bg-transparent cursor-ns-resize absolute -rotate-90 origin-center
            focus:outline-none

            [&::-webkit-slider-thumb]:appearance-none 
            [&::-webkit-slider-thumb]:w-5 
            [&::-webkit-slider-thumb]:h-14 
            [&::-webkit-slider-thumb]:bg-zinc-300 
            [&::-webkit-slider-thumb]:border-x-4
            [&::-webkit-slider-thumb]:border-zinc-400
            [&::-webkit-slider-thumb]:rounded-sm 
            [&::-webkit-slider-thumb]:shadow-[0_4px_6px_rgba(0,0,0,0.5)]
            [&::-webkit-slider-thumb]:cursor-grab
            active:[&::-webkit-slider-thumb]:cursor-grabbing

            [&::-moz-range-thumb]:w-5 
            [&::-moz-range-thumb]:h-14 
            [&::-moz-range-thumb]:bg-zinc-300 
            [&::-moz-range-thumb]:border-x-4
            [&::-moz-range-thumb]:border-zinc-400
            [&::-moz-range-thumb]:rounded-sm 
            [&::-moz-range-thumb]:border-none 
            [&::-moz-range-thumb]:shadow-[0_4px_6px_rgba(0,0,0,0.5)]
            [&::-moz-range-thumb]:cursor-grab
            active:[&::-moz-range-thumb]:cursor-grabbing"
        />
      </div>

      {/* チャンネルON/OFF風の再生ボタンスイッチ */}
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