import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import {
  DEFAULT_PARAMS, PRESETS, TIP_MODES, cableAngle, cableDeltas, cablePorts, chain, derive, dimensionCsv, earDims, hexagon, toWorld,
} from '../utils/spiman.js'
import { to3mf, toStl } from '../utils/spimanSolid.js'

const RAD = Math.PI / 180
const TPU_DENSITY = 1.21 // g/cm³
const CABLE_COLORS = ['#f87171', '#60a5fa', '#34d399', '#fbbf24']

// ソリッドの形に効くパラメータ（S と φ は姿勢だけなので再生成しない）
const SOLID_KEYS = [
  'w', 'h', 'thetaUnder', 'thetaSum', 'k', 'N', 'cableCount', 'cableRatio', 'holeDia', 'spineRatio', 'notchDepth', 'baseThickness', 'tipMode',
]

function download(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const TIP_HINTS = {
  passive: '穴が入らない細い先端は、スパインの弾性でついてくるだけです。',
  truncate: '穴が入る最後のユニットで触手を終わらせます。全体がケーブルで動きますが、先端は太くなります。',
  clamp: '穴が入る最小サイズより小さくせず、同じ大きさのユニットを N 個まで続けます。',
  external: '細いユニットの縁の外に穴付きのガイドを付けます。ガイドの上下面は円錐面の延長なので、曲げても本体と同時にしか当たりません。',
}

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—')
// SVG 座標は丸める（サーバと各ブラウザで三角関数の最下位桁が違い、ハイドレーションがずれるため）
const n3 = (v) => Math.round(v * 1000) / 1000

// ── 入力 ────────────────────────────────────────────────────────────────────
function Field({ label, sym, value, min, max, step, unit, onChange, hint }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-slate-200">
          {label}
          {sym && <span className="ml-1 font-mono text-cyan-300">{sym}</span>}
        </span>
        <span className="flex items-baseline gap-1">
          <input
            type="number" value={value} min={min} max={max} step={step}
            onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(v) }}
            className="w-20 rounded border border-white/10 bg-slate-900 px-1.5 py-0.5 text-right font-mono text-sm text-slate-100"
          />
          <span className="w-6 text-xs text-slate-400">{unit}</span>
        </span>
      </div>
      <input
        type="range" value={value} min={min} max={max} step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-1 w-full accent-cyan-400"
      />
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </label>
  )
}

// ── 2D ベースモデル（曲げ平面内の断面） ─────────────────────────────────────
function Profile2D({ params, geo, S }) {
  const frames = chain(geo, S)
  const polys = geo.units.map((u, i) => hexagon(u, geo).map(([x, y]) => toWorld(frames[i], x, y)))

  const cables = [1, -1].map((side) => {
    const pts = []
    for (let i = 0; i <= geo.lastHole; i++) {
      const { Xb, Yb, Xt, Yt } = cablePorts(geo.units[i], params, geo)
      pts.push(toWorld(frames[i], side * Xb, Yb), toWorld(frames[i], side * Xt, Yt))
    }
    return pts
  })

  // 外付けガイド（両側）。上下面は円錐面の延長
  const ears = geo.units.filter((u) => u.hole === 'outer').flatMap((u) => {
    const { r0, r1 } = earDims(u, geo)
    return [1, -1].map((sd) => [
      [sd * r0, r0 * geo.tu], [sd * r1, r1 * geo.tu], [sd * r1, u.h - r1 * geo.tp], [sd * r0, u.h - r0 * geo.tp],
    ].map(([x, y]) => toWorld(frames[u.i], x, y)))
  })

  const u0 = geo.units[0]
  const baseBottom = Math.min(0, u0.w * geo.tu) - params.baseThickness
  const baseTop = Math.max(0, u0.w * geo.tu)
  const base = params.baseThickness > 0
    ? [[-u0.w, baseBottom], [u0.w, baseBottom], [u0.w, baseTop], [-u0.w, baseTop]]
    : null

  const all = polys.flat().concat(base ?? [], ears.flat())
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of all) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
  }
  const pad = 0.06 * Math.max(maxX - minX, maxY - minY)
  const vb = [minX - pad, -(maxY + pad), maxX - minX + 2 * pad, maxY - minY + 2 * pad].map(n3)
  const path = (pts) => pts.map(([x, y]) => `${x.toFixed(3)},${(-y).toFixed(3)}`).join(' ')

  return (
    <svg viewBox={vb.join(' ')} className="h-full w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label="ベースモデルの断面図">
      {base && <polygon points={path(base)} fill="#334155" stroke="#64748b" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      {polys.map((pts, i) => (
        <polygon
          key={i} points={path(pts)}
          fill={i % 2 ? 'rgba(34,211,238,0.10)' : 'rgba(34,211,238,0.18)'}
          stroke="#f43f5e" strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round"
        />
      ))}
      {ears.map((pts, i) => (
        <polygon key={`e${i}`} points={path(pts)} fill="rgba(52,211,153,0.25)" stroke="#34d399" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
      <polyline points={path(frames.map((f) => [f.ox, f.oy]))} fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      {cables.map((pts, k) => pts.length > 1 && (
        <polyline key={k} points={path(pts)} fill="none" stroke={k === 0 ? '#fbbf24' : '#a78bfa'} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      ))}
      {frames.slice(1).map((f, i) => (
        <circle key={i} cx={n3(f.ox)} cy={n3(-f.oy)} r={n3(Math.max(0.25, geo.units[i + 1].w * 0.08))} fill="#e2e8f0" />
      ))}
    </svg>
  )
}

// ── ジョイスティック（曲げ方向 φ と曲げ量 S） ─────────────────────────────────
function Joystick({ S, phi, thetaSum, onChange }) {
  const ref = useRef(null)
  const r = thetaSum > 0 ? -S / thetaSum : 0
  const kx = n3(r * Math.cos(phi * RAD)) || 0
  const ky = n3(-r * Math.sin(phi * RAD)) || 0

  const handle = (e) => {
    const rect = ref.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 2.3 - 1.15
    const y = -(((e.clientY - rect.top) / rect.height) * 2.3 - 1.15)
    const mag = Math.min(1, Math.hypot(x, y))
    if (mag < 0.06) { onChange({ S: 0, phi }); return }
    const newPhi = Math.round(((Math.atan2(y, x) / RAD) + 360) % 360)
    onChange({ S: -Math.round(mag * thetaSum * 2) / 2, phi: newPhi })
  }

  return (
    <svg
      ref={ref} viewBox="-1.15 -1.15 2.3 2.3" className="h-36 w-36 touch-none select-none"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); handle(e) }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) handle(e) }}
      onDoubleClick={() => onChange({ S: 0, phi })}
      role="slider" aria-label="曲げ方向と曲げ量" aria-valuenow={S}
    >
      <circle r="1" fill="#0f172a" stroke="#334155" strokeWidth="0.03" />
      <circle r="0.5" fill="none" stroke="#1e293b" strokeWidth="0.02" />
      <line x1="-1" x2="1" stroke="#1e293b" strokeWidth="0.02" />
      <line y1="-1" y2="1" stroke="#1e293b" strokeWidth="0.02" />
      <line x1="0" y1="0" x2={kx} y2={ky} stroke="#22d3ee" strokeWidth="0.04" />
      <circle cx={kx} cy={ky} r="0.16" fill="#22d3ee" />
    </svg>
  )
}

// ── 3D プレビュー ─────────────────────────────────────────────────────────────
function Viewer3D({ solid, S, phi }) {
  const mountRef = useRef(null)
  const ctxRef = useRef(null)

  useEffect(() => {
    const el = mountRef.current
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0b1220)
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000)
    camera.up.set(0, 0, 1)
    camera.position.set(150, -250, 150)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    el.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.4))
    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(200, -300, 400)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x88ccff, 0.6)
    rim.position.set(-200, 300, 100)
    scene.add(rim)
    const grid = new THREE.GridHelper(400, 40, 0x334155, 0x1e293b)
    grid.rotateX(Math.PI / 2)
    scene.add(grid)

    const root = new THREE.Group()
    scene.add(root)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    let raf
    const loop = () => {
      raf = requestAnimationFrame(loop)
      controls.update()
      renderer.render(scene, camera)
    }
    loop()

    ctxRef.current = { scene, camera, controls, root, joints: [], materials: [], fitLength: 0 }
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      root.traverse((o) => o.geometry?.dispose())
      for (const m of ctxRef.current?.materials ?? []) m.dispose()
      renderer.dispose()
      el.removeChild(renderer.domElement)
      ctxRef.current = null
    }
  }, [])

  // ソリッドが変わったらユニットの入れ子構造を作り直す
  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx || !solid) return
    const { root } = ctx
    root.traverse((o) => o.geometry?.dispose())
    root.clear()
    for (const m of ctx.materials) m.dispose()
    ctx.materials = [0xe2e8f0, 0xb6c2d2].map((color) => new THREE.MeshStandardMaterial({
      color, roughness: 0.55, metalness: 0.05, flatShading: true,
    }))

    const { g, p, result } = solid
    const zBase = Math.min(0, g.units[0].w * g.tu) - p.baseThickness
    root.position.set(0, 0, -zBase)
    const joints = []
    let parent = root
    g.units.forEach((u, i) => {
      const group = new THREE.Group()
      if (i > 0) group.position.set(0, 0, g.units[i - 1].h)
      const geom = new THREE.BufferGeometry()
      geom.setAttribute('position', new THREE.BufferAttribute(result.units[i].positions, 3))
      geom.setIndex(new THREE.BufferAttribute(result.units[i].indices, 1))
      geom.computeVertexNormals()
      group.add(new THREE.Mesh(geom, ctx.materials[i % 2]))
      parent.add(group)
      if (i > 0) joints.push(group)
      parent = group
    })
    ctx.joints = joints

    // 大きさが大きく変わったときだけ、姿勢を反映した後（下の effect）で視点を合わせ直す
    const L = g.length
    if (Math.abs(L - ctx.fitLength) > 0.25 * Math.max(L, ctx.fitLength)) {
      ctx.fitLength = L
      ctx.needFit = true
    }
  }, [solid])

  // 姿勢（S, φ）の更新：各関節を同じ軸まわりに −S 回転
  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    const axis = new THREE.Vector3(-Math.sin(phi * RAD), Math.cos(phi * RAD), 0)
    for (const j of ctx.joints) j.quaternion.setFromAxisAngle(axis, -S * RAD)
    if (ctx.needFit && ctx.joints.length + 1 === solid?.g.units.length) {
      ctx.needFit = false
      ctx.root.updateMatrixWorld(true)
      const sphere = new THREE.Box3().setFromObject(ctx.root).getBoundingSphere(new THREE.Sphere())
      const r = sphere.radius
      ctx.controls.target.copy(sphere.center)
      ctx.camera.position.copy(sphere.center).add(new THREE.Vector3(0.45, -0.75, 0.48).multiplyScalar(r * 3.2))
      ctx.camera.near = r / 100
      ctx.camera.far = r * 100
      ctx.camera.updateProjectionMatrix()
      ctx.controls.update()
    }
  }, [solid, S, phi])

  return <div ref={mountRef} className="h-full w-full" />
}

// ── 本体 ────────────────────────────────────────────────────────────────────
export default function SpiMan() {
  const [params, setParams] = useState(DEFAULT_PARAMS)
  const [solid, setSolid] = useState(null)
  const [busy, setBusy] = useState(false)
  const [solidError, setSolidError] = useState('')
  const [dragging, setDragging] = useState(false) // スライダーをドラッグ中は 3D を作り直さない
  const workerRef = useRef(null)
  const reqRef = useRef(0)

  const set = (key) => (value) => setParams((p) => ({ ...p, [key]: value }))
  const geo = useMemo(() => derive(params), [params])
  // 各先端処理でケーブルが何個目まで届くか（選択肢に表示して比べられるように）
  const tipReach = useMemo(() => Object.fromEntries(TIP_MODES.map((m) => {
    const g = derive({ ...params, tipMode: m.key })
    if (g.errors.length || g.lastHole < 0) return [m.key, '使えません']
    return [m.key, `${g.lastHole + 1}/${g.N} 個`]
  })), [params])
  const S = Math.max(-params.thetaSum, Math.min(params.thetaSum, params.S))
  const solidKey = JSON.stringify(SOLID_KEYS.map((k) => params[k]))
  const hasErrors = geo.errors.length > 0

  useEffect(() => () => workerRef.current?.terminate(), [])

  useEffect(() => {
    if (!dragging) return
    const end = () => setDragging(false)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [dragging])

  useEffect(() => {
    if (hasErrors || dragging) return
    const values = JSON.parse(solidKey)
    const sp = Object.fromEntries(SOLID_KEYS.map((k, i) => [k, values[i]]))
    const timer = setTimeout(() => {
      if (!workerRef.current) {
        workerRef.current = new Worker(new URL('../utils/spimanWorker.js', import.meta.url), { type: 'module' })
      }
      const worker = workerRef.current
      const id = ++reqRef.current
      worker.onmessage = (e) => {
        if (e.data.id !== reqRef.current) return
        setBusy(false)
        if (e.data.error) { setSolidError(e.data.error); return }
        setSolidError('')
        setSolid({ p: sp, g: derive(sp), result: e.data.result })
      }
      worker.onerror = (e) => { setBusy(false); setSolidError(e.message || 'ワーカーの起動に失敗しました') }
      setBusy(true)
      worker.postMessage({ id, params: sp })
    }, 150)
    return () => clearTimeout(timer)
  }, [solidKey, hasErrors, dragging])

  const deltas = hasErrors ? [] : cableDeltas(params, geo, S, params.phi)
  const volume = solid?.result.volume
  const stale = busy || (solid && JSON.stringify(SOLID_KEYS.map((k) => solid.p[k])) !== solidKey)
  const exportable = solid && !stale && !hasErrors
  const overhang = 90 - params.thetaUnder // 下面の傾き（鉛直から）

  return (
    <main className="px-4 py-8 md:px-6">
      <div className="flex w-full flex-col gap-6">
        <header>
          <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">SpiMan 設計支援システム</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">
            タコの腕のような触手型機構（SpiMan）を 6 つのパラメータで設計し、巻き取り時の形をシミュレーションして、
            そのまま 3D プリントできる STL / 3MF を書き出します。六角形のユニットを縮小比率 k で小さくしながら N 個積み、
            4 本のケーブルで 360° 曲げる構造です。
            <span className="text-slate-400">（白田・吉田・謝「触手型機構を用いたウェアラブルデバイスの開発と設計支援システムの提案」情報処理学会 HCI 研究会 2025 の設計支援システムを Web で再構成）</span>
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          {/* ── パラメータ ── */}
          <aside
            onPointerDown={(e) => { if (e.target.type === 'range') setDragging(true) }}
            className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((pr) => (
                <button
                  key={pr.key} type="button"
                  onClick={() => setParams({ ...DEFAULT_PARAMS, ...pr.params })}
                  className="rounded-full border border-white/15 px-3 py-1 text-xs text-slate-200 hover:border-cyan-300/60 hover:bg-white/10"
                >
                  {pr.label}
                </button>
              ))}
            </div>

            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold tracking-widest text-slate-400 uppercase">ベースモデル</h2>
              <Field label="幅（半幅）" sym="w" value={params.w} min={1} max={40} step={0.1} unit="mm" onChange={set('w')} hint={`1 個目の直径 2w = ${fmt(2 * params.w)} mm`} />
              <Field label="高さ" sym="h" value={params.h} min={1} max={60} step={0.1} unit="mm" onChange={set('h')} />
              <Field label="下部角度" sym="θunder" value={params.thetaUnder} min={-60} max={80} step={1} unit="°" onChange={set('thetaUnder')} />
              <Field label="合計角度" sym="θsum" value={params.thetaSum} min={1} max={80} step={1} unit="°" onChange={set('thetaSum')} hint={`上部角度 θsum − θunder = ${fmt(geo.thetaUpper, 0)}°（関節 1 つで曲がる最大角）`} />
              <Field label="縮小比率" sym="k" value={params.k} min={0.7} max={1} step={0.001} unit="" onChange={set('k')} />
              <Field label="個数" sym="N" value={params.N} min={1} max={80} step={1} unit="個" onChange={(v) => set('N')(Math.round(v))} />
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold tracking-widest text-slate-400 uppercase">シミュレーション</h2>
              <Field label="シミュレーション" sym="S" value={S} min={-params.thetaSum} max={params.thetaSum} step={0.5} unit="°" onChange={set('S')} hint={`関節 1 つあたりの曲げ角。全体で ${fmt((geo.N - 1) * S, 0)}°`} />
              <div className="flex items-center gap-4">
                <Joystick S={S} phi={params.phi} thetaSum={params.thetaSum} onChange={({ S: s, phi }) => setParams((p) => ({ ...p, S: s, phi }))} />
                <div className="text-xs leading-5 text-slate-400">
                  ジョイスティックで曲げる方向と量を操作（実機の操作と同じ）。ダブルクリックでまっすぐに戻ります。
                  <div className="mt-1 font-mono text-slate-300">φ = {params.phi}°</div>
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold tracking-widest text-slate-400 uppercase">立体化（3D プリント用）</h2>
              <label className="flex items-center justify-between text-sm text-slate-200">
                ケーブル本数
                <select
                  value={params.cableCount} onChange={(e) => set('cableCount')(Number(e.target.value))}
                  className="rounded border border-white/10 bg-slate-900 px-2 py-1 text-sm"
                >
                  {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} 本</option>)}
                </select>
              </label>
              <Field label="ケーブル穴の位置" value={params.cableRatio} min={0.3} max={0.9} step={0.01} unit="×w" onChange={set('cableRatio')} />
              <Field label="ケーブル穴の直径" value={params.holeDia} min={0.4} max={4} step={0.1} unit="mm" onChange={set('holeDia')} hint="PE ライン 0.8 号 (φ0.165) なら 1 mm 前後" />
              <Field label="中心スパインの太さ" value={params.spineRatio} min={0.05} max={0.5} step={0.01} unit="×w" onChange={set('spineRatio')} />
              <Field label="窪みの深さ" value={params.notchDepth} min={0} max={0.5} step={0.01} unit="×w" onChange={set('notchDepth')} />
              <Field label="取付ベースの厚さ" value={params.baseThickness} min={0} max={20} step={0.5} unit="mm" onChange={set('baseThickness')} />
              <label className="block text-sm text-slate-200">
                先端の処理
                <select
                  value={params.tipMode} onChange={(e) => set('tipMode')(e.target.value)}
                  className="mt-1 w-full rounded border border-white/10 bg-slate-900 px-2 py-1 text-sm"
                >
                  {TIP_MODES.map((m) => <option key={m.key} value={m.key}>{m.label}（{tipReach[m.key]}）</option>)}
                </select>
                <span className="mt-1 block text-xs leading-5 text-slate-500">{TIP_HINTS[params.tipMode]}</span>
              </label>
            </section>
          </aside>

          {/* ── 表示 ── */}
          <div className="flex min-w-0 flex-col gap-6">
            {hasErrors && (
              <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-200">
                {geo.errors.map((e) => <p key={e}>{e}</p>)}
              </div>
            )}

            <div className="grid gap-6 xl:grid-cols-2">
              <figure className="flex min-w-0 flex-col rounded-2xl border border-white/10 bg-slate-900/60 p-3">
                <figcaption className="mb-2 flex flex-wrap justify-between gap-x-3 text-xs text-slate-400">
                  <span>ベースモデル（曲げ平面の断面）</span>
                  <span><span className="text-amber-300">━</span> 内側 <span className="text-violet-300">━</span> 外側ケーブル</span>
                </figcaption>
                <div className="aspect-square max-h-[75vh] w-full">
                  {!hasErrors && <Profile2D params={params} geo={geo} S={S} />}
                </div>
              </figure>

              <figure className="flex min-w-0 flex-col rounded-2xl border border-white/10 bg-slate-900/60 p-3">
                <figcaption className="mb-2 flex flex-wrap justify-between gap-x-3 text-xs text-slate-400">
                  <span>3D プレビュー（ドラッグで回転・ホイールで拡大）</span>
                  <span className={stale ? 'text-cyan-300' : ''}>{busy ? '生成中…' : stale ? (dragging ? '離すと更新' : '更新待ち') : ''}</span>
                </figcaption>
                <div className={`relative aspect-square max-h-[75vh] w-full overflow-hidden rounded-lg transition-opacity ${stale ? 'opacity-60' : ''}`}>
                  <Viewer3D solid={solid} S={S} phi={params.phi} />
                  {!solid && !solidError && (
                    <div className="absolute inset-0 grid place-items-center text-sm text-slate-400">ジオメトリエンジンを読み込み中…</div>
                  )}
                </div>
                {solidError && <p className="mt-2 text-xs text-rose-300">生成エラー: {solidError}</p>}
              </figure>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h2 className="mb-3 text-sm font-semibold text-white">寸法</h2>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-slate-400">全長（ベース除く）</dt><dd className="text-right font-mono">{fmt(geo.length)} mm</dd>
                  <dt className="text-slate-400">根元の直径</dt><dd className="text-right font-mono">{fmt(2 * params.w)} mm</dd>
                  <dt className="text-slate-400">先端の直径</dt><dd className="text-right font-mono">{fmt(geo.tipWidth, 2)} mm</dd>
                  <dt className="text-slate-400">全体の曲げ角</dt><dd className="text-right font-mono">{fmt((geo.N - 1) * S, 0)}°</dd>
                  <dt className="text-slate-400">ユニット数</dt>
                  <dd className="text-right font-mono">{geo.N} 個{geo.N !== geo.Nreq && <span className="text-slate-400">（N={geo.Nreq} から短縮）</span>}</dd>
                  <dt className="text-slate-400">ケーブルが届く範囲</dt>
                  <dd className="text-right font-mono">{geo.lastHole >= 0 ? `1〜${geo.lastHole + 1} 個目` : 'なし'}</dd>
                  <dt className="text-slate-400">ケーブルが届かない先端</dt>
                  <dd className="text-right font-mono">{fmt(geo.passiveLength)} mm</dd>
                  <dt className="text-slate-400">体積 / TPU 質量</dt>
                  <dd className="text-right font-mono">{volume ? `${fmt(volume / 1000)} cm³ / ${fmt((volume / 1000) * TPU_DENSITY)} g` : '—'}</dd>
                </dl>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-400">
                  {geo.lastHole >= 0 && geo.lastHole < geo.N - 1 && (
                    <li>{geo.lastHole + 2} 個目から先は細すぎて穴が入りません。ケーブルは {geo.lastHole + 1} 個目の上面で結んで固定します。</li>
                  )}
                  {geo.lastHole >= 0 && geo.lastHole === geo.N - 1 && geo.units.length > 0 && (
                    <li>ケーブルは先端（{geo.N} 個目）の上面で結んで固定します。</li>
                  )}
                  {geo.mode === 'clamp' && geo.sMin < 1 && geo.Nreq > 1 && (
                    <li>半幅 {fmt(params.w * geo.sMin, 2)} mm より小さくはしません（{geo.units.filter((u) => u.s === geo.sMin).length} 個が同じ大きさ）。</li>
                  )}
                  {geo.mode === 'external' && (
                    geo.units.some((u) => u.hole === 'outer')
                      ? <li>{geo.lastInner + 2}〜{geo.lastHole + 1} 個目は外付けガイド（緑）にケーブルを通します。</li>
                      : <li className="text-amber-300">このパラメータでは外付けガイドを付けられるユニットがありません（細いユニットは上下の隙間が小さく、ガイドの高さが 0.8 mm 取れないため）。</li>
                  )}
                  {geo.lastHole < 0 && !hasErrors && <li className="text-amber-300">1 個目にもケーブル穴が入りません。穴径・スパインを小さくするか、穴の位置を調整してください。</li>}
                  {(overhang > 50 || params.thetaUnder < 0) && (
                    <li>ユニット下面が水平に近い（{fmt(params.thetaUnder, 0)}°）ので、立てて印刷するならサポートが必要です。</li>
                  )}
                </ul>
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h2 className="mb-3 text-sm font-semibold text-white">ケーブルの長さ変化（S = {fmt(S, 1)}°, φ = {params.phi}°）</h2>
                {deltas.length ? (
                  <table className="w-full text-sm">
                    <thead className="text-xs text-slate-400">
                      <tr><th className="text-left font-normal">ケーブル</th><th className="text-right font-normal">位置</th><th className="text-right font-normal">長さ変化</th></tr>
                    </thead>
                    <tbody>
                      {deltas.map((d) => (
                        <tr key={d.j}>
                          <td><span style={{ color: CABLE_COLORS[d.j] }}>●</span> #{d.j + 1}</td>
                          <td className="text-right font-mono text-slate-300">{cableAngle(d.j, params.cableCount)}°</td>
                          <td className={`text-right font-mono ${d.delta < -0.05 ? 'text-amber-300' : 'text-slate-200'}`}>
                            {d.delta >= 0 ? '+' : ''}{fmt(d.delta)} mm
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="text-sm text-slate-400">ケーブル穴がありません。</p>}
                <p className="mt-3 text-xs leading-5 text-slate-400">
                  負の値がモータで巻き取る量、正の値が繰り出す量です。対面のケーブルはほぼ同じ量だけ逆向きに動くので、論文の実機のように対面のモータを連動させられます。
                </p>
              </section>
            </div>

            <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-5">
              <button
                type="button" disabled={!exportable}
                onClick={() => download(toStl(solid.result.merged), 'spiman.stl')}
                className="rounded-full bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-40"
              >
                STL を書き出す
              </button>
              <button
                type="button" disabled={!exportable}
                onClick={async () => download(await to3mf(solid.result.merged), 'spiman.3mf')}
                className="rounded-full bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-40"
              >
                3MF を書き出す
              </button>
              <button
                type="button" disabled={hasErrors}
                onClick={() => download(new Blob([dimensionCsv(params, geo)], { type: 'text/csv' }), 'spiman_dimensions.csv')}
                className="rounded-full border border-white/20 px-5 py-2 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-40"
              >
                寸法表 (CSV)
              </button>
              <p className="w-full text-xs leading-5 text-slate-400">
                書き出すのは真っすぐな状態のモデルです（底面 z = 0、単位 mm）。触手部分は TPU での印刷を想定しています。
                {stale && ' パラメータ変更後の生成が終わるとボタンが有効になります。'}
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
