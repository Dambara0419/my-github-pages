import { useEffect, useRef, useState, useCallback } from 'react';

const numRows = 50;
const numCols = 50;
const cellSize = 10;

// 周囲8方向を調べるための座標オフセット
const operations = [
  [0, 1], [0, -1], [1, -1], [-1, 1],
  [1, 1], [-1, -1], [1, 0], [-1, 0]
];

export default function GameOfLife() {
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  
  // 盤面の状態（初期状態はランダム）
  const gridRef = useRef(() => {
    const rows = [];
    for (let i = 0; i < numRows; i++) {
      rows.push(Array.from(Array(numCols), () => (Math.random() > 0.8 ? 1 : 0)));
    }
    return rows;
  });

  const [isRunning, setIsRunning] = useState(false);
  const runningRef = useRef(isRunning);
  runningRef.current = isRunning;

  // 描画ロジック
  const drawGrid = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // 画面全体をクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const grid = gridRef.current;

    for (let i = 0; i < numRows; i++) {
      for (let j = 0; j < numCols; j++) {
        if (grid[i][j]) {
          ctx.fillStyle = '#10b981'; // 生きているセル（emerald-500相当）
          ctx.fillRect(j * cellSize, i * cellSize, cellSize, cellSize);
        }
      }
    }
  }, []);

  // 次の世代の計算ロジック
  const computeNextGen = useCallback(() => {
    const currentGrid = gridRef.current;
    // ダブルバッファリング用に新しい空の盤面を用意
    const nextGrid = Array(numRows).fill(0).map(() => Array(numCols).fill(0));

    for (let i = 0; i < numRows; i++) {
      for (let j = 0; j < numCols; j++) {
        let neighbors = 0;
        // 周囲8マスの生存セルをカウント
        operations.forEach(([x, y]) => {
          const newI = i + x;
          const newJ = j + y;
          // 盤面の範囲内かチェック（端は壁として扱う）
          if (newI >= 0 && newI < numRows && newJ >= 0 && newJ < numCols) {
            neighbors += currentGrid[newI][newJ];
          }
        });

        // ライフゲームのルール適用
        if (currentGrid[i][j] === 1 && (neighbors < 2 || neighbors > 3)) {
          nextGrid[i][j] = 0; // 過疎・過密で死滅
        } else if (currentGrid[i][j] === 0 && neighbors === 3) {
          nextGrid[i][j] = 1; // 誕生
        } else {
          nextGrid[i][j] = currentGrid[i][j]; // 現状維持
        }
      }
    }
    gridRef.current = nextGrid;
  }, []);

  // マウスクリックでのセル反転ロジック
  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // キャンバスの左上座標を取得して、クリックしたピクセル座標を計算
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // ピクセル座標をグリッドのインデックス（何行目、何列目か）に変換
    const clickedCol = Math.floor(x / cellSize);
    const clickedRow = Math.floor(y / cellSize);

    // 範囲外クリックの防止
    if (clickedRow >= 0 && clickedRow < numRows && clickedCol >= 0 && clickedCol < numCols) {
      // 0と1を反転させる
      gridRef.current[clickedRow][clickedCol] = gridRef.current[clickedRow][clickedCol] ? 0 : 1;
      // 停止中でもクリックした結果がすぐ見えるように再描画
      drawGrid();
    }
  };

  // アニメーションループ
  const animate = useCallback(() => {
    if (!runningRef.current) return;

    computeNextGen();
    drawGrid();

    // 実行速度を少し落とすための簡易的なウェイト（約10fps）
    setTimeout(() => {
      requestRef.current = requestAnimationFrame(animate);
    }, 100);
  }, [computeNextGen, drawGrid]);

  useEffect(() => {
    if (isRunning) {
      requestRef.current = requestAnimationFrame(animate);
    } else if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [isRunning, animate]);

  // 初回マウント時に盤面を描画
  useEffect(() => {
    drawGrid();
  }, [drawGrid]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-slate-950 p-8">
      <h1 className="text-3xl font-bold text-slate-100">Conway's Game of Life</h1>
      
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-lg">
        <canvas
          ref={canvasRef}
          width={numCols * cellSize}
          height={numRows * cellSize}
          onClick={handleCanvasClick}
          className="cursor-crosshair rounded-md border border-slate-800 bg-slate-950"
        />
      </div>

      <div className="flex gap-4">
        <button
          onClick={() => setIsRunning(!isRunning)}
          className={`cursor-pointer rounded-lg px-6 py-2 font-semibold text-white transition-colors ${
            isRunning 
              ? 'bg-rose-600 hover:bg-rose-500' 
              : 'bg-emerald-600 hover:bg-emerald-500'
          }`}
        >
          {isRunning ? 'Stop' : 'Start'}
        </button>
      </div>
    </div>
  );
}