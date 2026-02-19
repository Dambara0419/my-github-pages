import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function Otohifu() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [frequency, setFrequency] = useState(440);

  const audioCtxRef = useRef(null);
  const oscillatorRef = useRef(null);
  const gainNodeRef = useRef(null);
  const trackRef = useRef(null); // フェーダーの軌道を計算するためのRef

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

  // --- カスタムフェーダーのロジック ---
  const updateFrequencyFromPointer = (clientY) => {
    if (!trackRef.current) return;
    
    // フェーダーのDOM要素の位置と高さを取得
    const rect = trackRef.current.getBoundingClientRect();
    
    // クリックされたY座標を、フェーダー内の相対的な位置（0 〜 rect.height）に制限
    let y = Math.max(0, Math.min(clientY - rect.top, rect.height));
    
    // 下端が0%、上端が100%になるようにパーセンテージを計算
    const percent = 1 - (y / rect.height);
    
    const minFreq = 100;
    const maxFreq = 2000;
    // パーセンテージから新しい周波数を算出
    const newFreq = Math.round(minFreq + percent * (maxFreq - minFreq));
    
    setFrequency(newFreq);

    // 再生中なら即座に音程に反映
    if (isPlaying && oscillatorRef.current && audioCtxRef.current) {
      oscillatorRef.current.frequency.setValueAtTime(newFreq, audioCtxRef.current.currentTime);
    }
  };

  // ドラッグ開始（クリック/タップした瞬間）
  const handlePointerDown = (e) => {
    e.preventDefault(); // モバイルでのスクロール等のデフォルト動作を防ぐ
    updateFrequencyFromPointer(e.clientY); // クリックした位置に即座に移動

    // ドラッグ中の処理
    const handlePointerMove = (moveEvent) => {
      updateFrequencyFromPointer(moveEvent.clientY);
    };

    // ドラッグ終了の処理
    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    // 画面外までドラッグしても追従するように window にイベントを付与
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // ツマミの表示位置（CSS用）を計算（0% 〜 100%）
  const thumbPositionPercent = ((frequency - 100) / (2000 - 100)) * 100;

  return (
    <div className="bg-zinc-800 p-6 rounded-xl shadow-2xl w-48 flex flex-col items-center gap-8 mx-auto mt-10 border border-zinc-700 select-none">
      <button className="fixed top-0 left-0 bg-blue-500 text-white px-4 py-2 m-4 rounded hover:bg-blue-600 cursor-pointer">
          <Link to='/'>Back Home</Link>
      </button>
      
      {/* LED風モニター */}
      <div className="w-full bg-black border-2 border-zinc-900 rounded-md p-2 shadow-inner flex flex-col items-center justify-center">
        <span className="text-[10px] text-zinc-500 font-mono tracking-widest mb-1">FREQ (Hz)</span>
        <span className="font-mono text-2xl font-bold text-red-500 tracking-wider drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]">
          {frequency.toString().padStart(4, '0')}
        </span>
      </div>

      {/* 縦型カスタムフェーダー */}
      <div className="relative h-64 w-full flex justify-center items-center">
        
        {/* メモリ（左側） */}
        <div className="absolute left-2 h-full flex flex-col justify-between py-1 text-[10px] text-zinc-400 font-mono pointer-events-none">
          <span>MAX</span>
          <span>-</span>
          <span>-</span>
          <span>-</span>
          <span>MIN</span>
        </div>

        {/* トラック（操作エリア）: touch-noneでモバイルブラウザの誤動作を防止 */}
        <div 
          ref={trackRef}
          className="relative h-full w-12 flex justify-center cursor-pointer touch-none"
          onPointerDown={handlePointerDown}
        >
          {/* フェーダーの溝 */}
          <div className="absolute w-2 h-full bg-black rounded-full shadow-inner pointer-events-none"></div>
          
          {/* ツマミ本体 */}
          <div 
            className="absolute w-14 h-6 bg-zinc-300 border-x-4 border-zinc-400 rounded-sm shadow-[0_4px_6px_rgba(0,0,0,0.5)] flex items-center justify-center transition-none pointer-events-none"
            style={{ 
              bottom: `${thumbPositionPercent}%`, 
              // ツマミの中心がクリックした位置に合うようにY軸をずらす
              transform: 'translateY(50%)' 
            }}
          >
            {/* ツマミの滑り止めライン */}
            <div className="w-8 h-1 bg-zinc-500 rounded-full"></div>
          </div>
        </div>
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