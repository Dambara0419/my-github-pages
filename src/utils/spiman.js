// SpiMan（触手型機構）の形状計算。
// 白田・吉田・謝「触手型機構を用いたウェアラブルデバイスの開発と設計支援システムの提案」(IPSJ HCI-212, 2025) の
// 設計支援システムのパラメータ定義に従う:
//   w: 1個目のユニットの半幅（幅は 2w） / h: 高さ / θunder: 下部の角度 / θsum: 下部・上部の合計角度
//   k: 縮小比率 / N: ユニット総数 / S: シミュレーション（関節1つあたりの曲げ角, −θsum ≤ S ≤ θsum）
// ユニットのローカル座標は「下頂点 = 関節 = 原点」、上頂点が (0, h_i)。角度はすべて度。

const RAD = Math.PI / 180

export const PRESETS = [
  {
    key: 'p1', label: 'パラメータ1（図8a）',
    params: { w: 12, h: 16, thetaUnder: 22, thetaSum: 30, k: 0.91, N: 25, S: -30, cableCount: 4 },
  },
  {
    key: 'p2', label: 'パラメータ2（図8c）',
    params: { w: 10, h: 18, thetaUnder: 44, thetaSum: 30, k: 0.945, N: 50, S: -30, cableCount: 4 },
  },
  {
    key: 'p3', label: 'パラメータ3（図8e）',
    params: { w: 20, h: 18.8, thetaUnder: 15, thetaSum: 30, k: 0.89, N: 25, S: -30, cableCount: 4 },
  },
  {
    key: 'hand', label: 'SpiMan-Hand（指サイズ）',
    params: {
      w: 4, h: 5.5, thetaUnder: 22, thetaSum: 30, k: 0.93, N: 18, S: -30,
      cableCount: 1, cableRatio: 0.6, holeDia: 0.8, spineRatio: 0.2, notchDepth: 0, baseThickness: 3,
    },
  },
]

export const DEFAULT_PARAMS = {
  ...PRESETS[0].params,
  phi: 0, // 曲げる方向（3D, 度）
  spineRatio: 0.18, // 中心スパインの半径 / ユニット半幅
  cableRatio: 0.62, // ケーブル穴の位置 / ユニット半幅
  holeDia: 1.2, // ケーブル穴の直径 (mm)
  notchDepth: 0.25, // 側面の窪みの深さ / ユニット半幅（0 で窪みなし）
  baseThickness: 4, // 取付ベースの厚さ (mm, 0 でなし)
  tipMode: 'passive', // 先端の処理（TIP_MODES）
}

const MIN_WALL = 0.4 // 穴まわりに残す最小肉厚 (mm)

/** ケーブル j の周方向角度（度） */
export function cableAngle(j, count) {
  return (j * 360) / count
}

/** 窪みの周方向角度（度）。3本以上はケーブルの間、1〜2本は 45° ずらした 4 か所 */
export function notchAngles(count) {
  if (count >= 3) return Array.from({ length: count }, (_, j) => ((j + 0.5) * 360) / count)
  return [45, 135, 225, 315]
}

export const TIP_MODES = [
  { key: 'passive', label: '先端は受動（ケーブルは途中で固定）' },
  { key: 'truncate', label: '穴が届くところで終わらせる' },
  { key: 'clamp', label: '最小サイズで縮小を止める' },
  { key: 'external', label: '先端だけ外付けガイドに通す' },
]

const MIN_EAR_HEIGHT = 0.8 // 外付けガイドの最小の高さ (mm)

export function derive(p) {
  const thetaUpper = p.thetaSum - p.thetaUnder
  const tu = Math.tan(p.thetaUnder * RAD)
  const tp = Math.tan(thetaUpper * RAD)
  const mode = p.tipMode ?? 'passive'
  const c = p.cableRatio
  const rh = p.holeDia / 2
  const need = rh + MIN_WALL
  const errors = []

  // 内部の穴が入る最小スケール（隣へ k で縮むユニットでも入るよう保守的に）
  const dIn = p.w * (c * p.k - p.spineRatio)
  const dOut = p.w * (1 - c)
  const sMin = dIn > 0 && dOut > 0 ? Math.max(need / dIn, need / dOut) : Infinity

  const Nreq = Math.max(1, Math.round(p.N))
  const scaleAt = (i) => (mode === 'clamp' && sMin < 1 ? Math.max(p.k ** i, sMin) : p.k ** i)

  let units = []
  let z = 0
  for (let i = 0; i < Nreq; i++) {
    const s = scaleAt(i)
    const t = scaleAt(i + 1) / s // 次のユニットへの縮小率（クランプ後は 1）
    // ケーブル穴の中心線 X(Y) = c·w_i·(1 − (1−t)·Y/h_i)。A はその内向きの傾き tanβ
    units.push({ i, s, t, w: p.w * s, h: p.h * s, z, A: (c * p.w * (1 - t)) / p.h, hole: null })
    z += p.h * s
  }

  // 内部の穴が入るユニット（根元から連続）
  let lastInner = -1
  if (p.cableCount > 0) {
    for (const u of units) {
      const outerOk = c * u.w + rh + MIN_WALL <= u.w + 1e-9
      const innerOk = c * u.w * u.t - rh - MIN_WALL >= p.spineRatio * u.w - 1e-9
      if (!outerOk || !innerOk) break
      u.hole = 'inner'
      lastInner = u.i
    }
  }

  if (mode === 'truncate' && lastInner >= 0 && lastInner < units.length - 1) {
    units = units.slice(0, lastInner + 1)
    z = units.reduce((acc, u) => acc + u.h, 0)
  }

  // 外付けガイド：縁の外に穴を出し、ガイドの上下面は六角形の円錐面を延長した面にする（曲げたとき隣とぶつからない）
  if (mode === 'external' && lastInner >= 0) {
    for (const u of units.slice(lastInner + 1)) {
      const rOut = u.w + 2 * rh + MIN_WALL
      if (u.h - rOut * (tu + tp) < MIN_EAR_HEIGHT) break
      u.hole = 'outer'
    }
  }

  let lastHole = -1
  for (const u of units) { if (u.hole) lastHole = u.i; else break }
  const N = units.length

  if (!(p.w > 0)) errors.push('幅 w は正の値にしてください')
  if (!(p.h > 0)) errors.push('高さ h は正の値にしてください')
  if (!(p.k > 0 && p.k <= 1)) errors.push('縮小比率 k は 0 < k ≤ 1 にしてください')
  if (!(p.thetaSum > 0)) errors.push('合計角度 θsum は正の値にしてください')
  if (!(Math.abs(p.thetaUnder) < 89)) errors.push('下部角度 θunder は −89°〜89° にしてください')
  if (!(Math.abs(thetaUpper) < 89)) errors.push(`上部角度 θsum − θunder = ${thetaUpper.toFixed(1)}° が範囲外です（−89°〜89°）`)
  const side = p.h - p.w * (tu + tp)
  if (errors.length === 0 && !(side > 0.05 * p.h)) {
    errors.push(`ユニット側面の高さが ${side.toFixed(2)} mm しかなく六角形になりません。h を大きくするか、w や角度を小さくしてください`)
  }
  if (p.spineRatio >= p.cableRatio) errors.push('スパインがケーブル穴より太くなっています')
  if ((mode === 'truncate' || mode === 'clamp') && lastInner < 0 && errors.length === 0) {
    errors.push('1 個目にもケーブル穴が入らないため、この先端処理は使えません。穴径・スパインを小さくするか w を大きくしてください')
  }

  const passiveLength = units.filter((u) => !u.hole).reduce((acc, u) => acc + u.h, 0)

  return {
    N, Nreq, units, tu, tp, thetaUpper, rh, lastInner, lastHole, errors, side, mode,
    sMin, passiveLength,
    length: z,
    tipWidth: 2 * units[N - 1].w,
  }
}

/** 外付けガイドの寸法（ローカル, 正の側）：穴中心 R、ガイドの内端 r0・外端 r1 */
export function earDims(u, g) {
  const R = u.w + g.rh
  return { R, r0: u.w - MIN_WALL, r1: R + g.rh + MIN_WALL }
}

/** ユニット i の六角形断面（ローカル座標, 左右両側） */
export function hexagon(u, g) {
  const { w, h } = u
  return [
    [0, 0], [w, w * g.tu], [w, h - w * g.tp], [0, h], [-w, h - w * g.tp], [-w, w * g.tu],
  ]
}

/** ユニットの断面外形の上下端（ローカル Y） */
export function unitYRange(u, g) {
  return [Math.min(0, u.w * g.tu), Math.max(u.h, u.h - u.w * g.tp)]
}

/** ケーブル穴の入口（下面）と出口（上面）。ローカル座標, 正の側の半径 X と高さ Y */
export function cablePorts(u, p, g) {
  if (u.hole === 'outer') {
    const { R } = earDims(u, g)
    return { Xb: R, Yb: R * g.tu, Xt: R, Yt: u.h - R * g.tp }
  }
  const c = p.cableRatio
  const Xb = (c * u.w) / (1 + u.A * g.tu)
  const Xt = (c * u.w * u.t) / (1 - u.A * g.tp)
  return { Xb, Yb: Xb * g.tu, Xt, Yt: u.h - Xt * g.tp }
}

/**
 * 曲げ平面内の各ユニットの姿勢。関節ごとに S 度（反時計回り）回転する。
 * S < 0 で +x 側（3D では方向 φ）へ巻く。
 */
export function chain(g, S) {
  const frames = []
  let ox = 0, oy = 0, a = 0
  for (const u of g.units) {
    const c = Math.cos(a * RAD), s = Math.sin(a * RAD)
    frames.push({ ox, oy, a, c, s })
    ox += -s * u.h
    oy += c * u.h
    a += S
  }
  return frames
}

export function toWorld(f, x, y) {
  return [f.ox + f.c * x - f.s * y, f.oy + f.s * x + f.c * y]
}

/**
 * 各ケーブルの長さ変化 (mm)。負 = 巻き取り（短くなる）、正 = 繰り出し。
 * 曲げは方向 φ の平面内なので、ケーブルの φ 方向成分だけが曲げの影響を受ける。
 */
export function cableDeltas(p, g, S, phi) {
  if (g.lastHole < 0) return []
  const straight = chain(g, 0)
  const bent = chain(g, S)
  const length = (frames, cosA, sinA) => {
    let total = 0
    let prev = null
    for (let i = 0; i <= g.lastHole; i++) {
      const u = g.units[i]
      const { Xb, Yb, Xt, Yt } = cablePorts(u, p, g)
      for (const [X, Y] of [[Xb, Yb], [Xt, Yt]]) {
        const [d, z] = toWorld(frames[i], X * cosA, Y)
        const lateral = X * sinA
        if (prev) total += Math.hypot(d - prev[0], z - prev[1], lateral - prev[2])
        prev = [d, z, lateral]
      }
    }
    return total
  }
  return Array.from({ length: p.cableCount }, (_, j) => {
    const alpha = cableAngle(j, p.cableCount)
    const rel = (alpha - phi) * RAD
    const cosA = Math.cos(rel), sinA = Math.sin(rel)
    return { j, alpha, delta: length(bent, cosA, sinA) - length(straight, cosA, sinA) }
  })
}

/** Fusion などで手作業モデリングする人向けの寸法表 */
export function dimensionCsv(p, g) {
  const rows = [['unit', 'scale', 'half_width_w', 'width_2w', 'height_h', 'z_bottom', 'cable_hole']]
  for (const u of g.units) {
    rows.push([
      u.i + 1, u.s.toFixed(4), u.w.toFixed(3), (2 * u.w).toFixed(3), u.h.toFixed(3), u.z.toFixed(3),
      u.hole ?? 'none',
    ])
  }
  const head = [
    `# SpiMan w=${p.w} h=${p.h} theta_under=${p.thetaUnder} theta_sum=${p.thetaSum} k=${p.k} N=${g.N} tip=${g.mode}`,
    `# theta_upper=${g.thetaUpper} total_length=${g.length.toFixed(3)}`,
  ]
  return head.concat(rows.map((r) => r.join(','))).join('\n') + '\n'
}
