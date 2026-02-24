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
  
  // 物理演算用のRef
  const currentFreqRef = useRef(440);
  const velocityZRef = useRef(0);
  const positionZRef = useRef(0);
  const prevAzRef = useRef(0); // 追加: センサーのブレを吸収するためのRef

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

  // --- 改良版：加速度から高さを計算し、ピタッと止める処理 ---
  const handleMotion = useCallback((event) => {
    let az = event.acceleration.z || 0;

    // 1. ローパスフィルタ: 手の微小な震え（高周波ノイズ）を滑らかにする
    az = az * 0.2 + prevAzRef.current * 0.8;
    prevAzRef.current = az;

    // 2. スマートブレーキ機能
    if (Math.abs(az) < 0.4) {
      // 加速度が一定以下の時＝「ユーザーが手を止めた」と判定
      az = 0;
      // 残っている慣性（速度）を急速にゼロに近づけ、位置を固定する
      velocityZRef.current *= 0.5;
      if (Math.abs(velocityZRef.current) < 0.1) {
        velocityZRef.current = 0;
      }
    } else {
      // 動かしている最中だけ速度を蓄積する
      velocityZRef.current += az * 0.4; // 速度の蓄積感度
    }

    // 3. 速度から位置（高さ）を計算
    positionZRef.current += velocityZRef.current * 0.6; // 位置変化の感度

    // 4. 上下の限界値を設定（ドリフトしすぎ防止）
    positionZRef.current = Math.max(-1000, Math.min(1000, positionZRef.current));

    // 5. 音程へのマッピング（向きは前回ご指定のままです）
    const baseFreq = 440;
    const sensitivity = 1.2;
    let newFreq = baseFreq + (positionZRef.current * sensitivity);
    
    newFreq = Math.min(2000, Math.max(100, newFreq));
    newFreq = Math.floor(newFreq);

    currentFreqRef.current = newFreq;
    setFrequency(newFreq);

    if (oscillatorRef.current && audioCtxRef.current) {
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
        window.addEventListener('devicemotion', handleMotion);
        setSensorEnabled(true);
      }
      playSound();
    }
  };

  const handleWaveformChange = (e) => {
    const newWave = e.target.value;
    setWaveform(newWave);
    if (oscillatorRef.current) {
      oscillatorRef.current.type = newWave;
      if (gainNodeRef.current && audioCtxRef.current) {
        const volume = newWave === 'sine' ? 0.3 : 0.15;
        gainNodeRef.current.gain.setTargetAtTime(volume, audioCtxRef.current.currentTime, 0.1);
      }
    }
  };

  const handleResetPosition = () => {
    velocityZRef.current = 0;
    positionZRef.current = 0;
    prevAzRef.current = 0;
    setFrequency(440);
    currentFreqRef.current = 440;
    if (oscillatorRef.current && audioCtxRef.current) {
      oscillatorRef.current.frequency.setTargetAtTime(440, audioCtxRef.current.currentTime, 0.05);
    }
  };

  return (
    <div className="bg-zinc-800 p-6 rounded-xl shadow-2xl w-72 flex flex-col items-center gap-6 mx-auto mt-10 border border-zinc-700 select-none">
      <div className="w-full flex justify-between items-center">
        <Link to="/" className="text-xs bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 transition-colors">
            ← Back
        </Link>
        <button 
          onClick={handleResetPosition}
          className="text-[10px] bg-zinc-600 text-zinc-300 px-3 py-1.5 rounded hover:bg-zinc-500 transition-colors font-mono active:scale-95"
        >
          RESET POS
        </button>
      </div>
      
      {/* LED風モニター */}
      <div className="w-full bg-black border-2 border-zinc-900 rounded-md p-4 shadow-inner flex flex-col items-center justify-center relative overflow-hidden">
        {sensorEnabled && (
          <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_5px_rgba(239,68,68,1)]"></div>
        )}
        <span className="text-xs text-zinc-500 font-mono tracking-widest mb-1">ELEVATION FREQ</span>
        <span className="font-mono text-4xl font-bold text-red-500 tracking-wider drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]">
          {frequency.toString().padStart(4, '0')}
        </span>
      </div>

      {/* 波形セレクター */}
      <div className="w-full flex flex-col gap-1.5">
        <label className="text-[10px] text-zinc-400 font-mono tracking-wider">WAVEFORM</label>
        <select 
          value={waveform}
          onChange={handleWaveformChange}
          className="w-full bg-zinc-900 text-zinc-300 border border-zinc-600 p-2.5 rounded text-sm font-mono focus:outline-none focus:border-red-500 transition-colors cursor-pointer"
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
        className={`w-full py-4 font-bold text-lg tracking-wider rounded transition-all duration-200 shadow-md active:scale-95 ${
          isPlaying 
            ? 'bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.6)] hover:bg-green-400' 
            : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600 border border-zinc-600 shadow-inner'
        }`}
      >
        {isPlaying ? 'MOTION ON' : 'MOTION OFF'}
      </button>

      <p className="text-[10px] text-zinc-400 text-center px-1 leading-relaxed">
        スマホを画面上向きで持ち、地面に近づける(下げる)と高音、持ち上げる(上げる)と低音になります。ピタッと止めると音がキープされます。
      </p>

    </div>
  );
}