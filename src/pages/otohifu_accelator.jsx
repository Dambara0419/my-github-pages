import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';

export default function OtohifuAcc() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [frequency, setFrequency] = useState(440);
  const [waveform, setWaveform] = useState('sine');
  const [sensorEnabled, setSensorEnabled] = useState(false);

  const audioCtxRef = useRef(null);
  const oscillatorRef = useRef(null);
  const gainNodeRef = useRef(null);
  
  // センサーからの頻繁な更新でUIがカクつかないよう、実際の周波数はRefでも管理
  const currentFreqRef = useRef(440);

  // --- Web Audio API の制御 ---
  useEffect(() => {
    return () => {
      stopSound();
      window.removeEventListener('devicemotion', handleMotion);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close();
      }
    };
  }, []);

  const initAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };

  const playSound = () => {
    const ctx = initAudio();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = waveform;
    osc.frequency.setValueAtTime(currentFreqRef.current, ctx.currentTime);
    
    // 音量設定（ノコギリ波や矩形波は耳障りになりやすいので少し小さめに）
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

  // --- 加速度センサーの処理 ---
  const handleMotion = useCallback((event) => {
    // 重力を含まない純粋な加速度を取得（デバイスが静止している時は0に近い）
    const acc = event.acceleration;
    if (!acc || (acc.x === null && acc.y === null && acc.z === null)) return;

    // XYZ軸の加速度の合計（絶対値）を計算して動きの大きさを出す
    const movement = Math.abs(acc.x || 0) + Math.abs(acc.y || 0) + Math.abs(acc.z || 0);

    // 動きの大きさを周波数にマッピング
    // 基本周波数を200Hzとし、動きに応じて最大2000Hzくらいまで上がるように設定
    const baseFreq = 200;
    const sensitivity = 50; 
    let newFreq = baseFreq + (movement * sensitivity);
    
    // 上限と下限を設定
    newFreq = Math.min(2000, Math.max(100, newFreq));
    newFreq = Math.floor(newFreq);

    currentFreqRef.current = newFreq;

    // 状態更新（UI表示用。カクつき防止のために少し間引く等の工夫も可能ですが今回は直接更新）
    setFrequency(newFreq);

    // 再生中なら音程を滑らかに変更
    if (oscillatorRef.current && audioCtxRef.current) {
      // 少しだけ時間をかけて値を変更することで、プチプチ音（クリッピング）を防ぐ
      oscillatorRef.current.frequency.setTargetAtTime(
        newFreq, 
        audioCtxRef.current.currentTime, 
        0.05
      );
    }
  }, []);

  // --- センサーの許可と再生トグル ---
  const handleToggle = async () => {
    if (isPlaying) {
      stopSound();
    } else {
      // iOS 13+ のためのセンサー許可リクエスト
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
          const permissionState = await DeviceMotionEvent.requestPermission();
          if (permissionState === 'granted') {
            window.addEventListener('devicemotion', handleMotion);
            setSensorEnabled(true);
          } else {
            alert('加速度センサーのアクセスが拒否されました。');
          }
        } catch (error) {
          console.error("センサーの許可リクエストに失敗しました:", error);
        }
      } else {
        // AndroidやPCなど、許可リクエストが不要なブラウザ
        window.addEventListener('devicemotion', handleMotion);
        setSensorEnabled(true);
      }
      playSound();
    }
  };

  // 波形の変更処理
  const handleWaveformChange = (e) => {
    const newWave = e.target.value;
    setWaveform(newWave);
    if (oscillatorRef.current) {
      oscillatorRef.current.type = newWave;
      // 波形によって音量感が違うため、ここでゲインを調整
      if (gainNodeRef.current && audioCtxRef.current) {
        const volume = newWave === 'sine' ? 0.3 : 0.15;
        gainNodeRef.current.gain.setTargetAtTime(volume, audioCtxRef.current.currentTime, 0.1);
      }
    }
  };

  return (
    <div className="bg-zinc-800 p-6 rounded-xl shadow-2xl w-64 flex flex-col items-center gap-6 mx-auto mt-10 border border-zinc-700 select-none">
      <div className="w-full flex justify-start">
        <Link to="/" className="text-xs bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 transition-colors">
            ← Back
        </Link>
      </div>
      
      {/* LED風モニター */}
      <div className="w-full bg-black border-2 border-zinc-900 rounded-md p-3 shadow-inner flex flex-col items-center justify-center relative overflow-hidden">
        {/* センサー動作中のインジケーター */}
        {sensorEnabled && (
          <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_5px_rgba(239,68,68,1)]"></div>
        )}
        <span className="text-[10px] text-zinc-500 font-mono tracking-widest mb-1">ACCEL FREQ (Hz)</span>
        <span className="font-mono text-3xl font-bold text-red-500 tracking-wider drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]">
          {frequency.toString().padStart(4, '0')}
        </span>
      </div>

      {/* 波形セレクター */}
      <div className="w-full flex flex-col gap-1">
        <label className="text-[10px] text-zinc-400 font-mono tracking-wider">WAVEFORM</label>
        <select 
          value={waveform}
          onChange={handleWaveformChange}
          className="w-full bg-zinc-900 text-zinc-300 border border-zinc-600 p-2 rounded text-sm font-mono focus:outline-none focus:border-red-500 transition-colors cursor-pointer"
        >
          <option value="sine">Sine (サイン波)</option>
          <option value="square">Square (矩形波)</option>
          <option value="sawtooth">Sawtooth (ノコギリ波)</option>
          <option value="triangle">Triangle (三角波)</option>
        </select>
      </div>

      {/* CH ON/OFF ボタン */}
      <button
        onClick={handleToggle}
        className={`w-full py-4 font-bold text-lg tracking-wider rounded transition-all duration-200 shadow-md ${
          isPlaying 
            ? 'bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.6)] hover:bg-green-400' 
            : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600 border border-zinc-600 shadow-inner'
        }`}
      >
        {isPlaying ? 'MOTION ON' : 'MOTION OFF'}
      </button>

      <p className="text-[10px] text-zinc-500 text-center px-2">
        ※スマートフォンを振ると音程が変わります。初回タップ時にセンサーの許可を求めた場合は「許可」してください。
      </p>

    </div>
  );
}