// SpiMan の 3D ソリッド生成（manifold-3d）と STL / 3MF 書き出し。
// 論文で Fusion を使って手作業していた「断面スケッチ → 回転 → 窪みの切り取り → コピーと縮小」を自動化する。
// 各ユニットを実寸で作り（ケーブル穴は実寸の直径なので単純な相似コピーにはできない）、最後に結合する。

import { cableAngle, earDims, notchAngles, unitYRange } from './spiman.js'

let wasmPromise = null

export function loadManifold() {
  if (!wasmPromise) {
    wasmPromise = (async () => {
      const [{ default: Module }, { default: wasmUrl }] = await Promise.all([
        import('manifold-3d'),
        import('manifold-3d/manifold.wasm?url'),
      ])
      const wasm = await Module({ locateFile: () => wasmUrl })
      wasm.setup()
      return wasm
    })()
    wasmPromise.catch(() => { wasmPromise = null })
  }
  return wasmPromise
}

function meshOf(m) {
  const mesh = m.getMesh()
  const n = mesh.numProp
  const count = mesh.vertProperties.length / n
  const positions = new Float32Array(count * 3)
  for (let v = 0; v < count; v++) {
    positions[v * 3] = mesh.vertProperties[v * n]
    positions[v * 3 + 1] = mesh.vertProperties[v * n + 1]
    positions[v * 3 + 2] = mesh.vertProperties[v * n + 2]
  }
  return { positions, indices: Uint32Array.from(mesh.triVerts) }
}

/**
 * @returns {{ units: {positions: Float32Array, indices: Uint32Array}[], merged: {positions, indices}, volume: number }}
 *   units はユニットごとのローカル座標（関節 = 原点）のメッシュ。merged は真っすぐな状態の全体（z 最小 = 0）。
 */
export function buildSolid(wasm, p, g, segments = 64) {
  const { Manifold, CrossSection } = wasm
  const trash = []
  const t = (obj) => { trash.push(obj); return obj }

  try {
    const placed = []
    const units = []
    const notches = p.notchDepth > 0 ? notchAngles(p.cableCount) : []
    const baseT = p.baseThickness > 0 ? p.baseThickness : 0

    for (const u of g.units) {
      const [yMin, yMax] = unitYRange(u, g)

      // 1. 断面（六角形の右半分）を回転して回転体にする
      const profile = t(new CrossSection([[[0, 0], [u.w, u.w * g.tu], [u.w, u.h - u.w * g.tp], [0, u.h]]]))
      let body = t(Manifold.revolve(profile, segments))

      // 2. 押し出し（切り取り）で側面に窪みをつける
      if (notches.length) {
        const rho = 0.32 * u.w
        const dist = u.w + rho - p.notchDepth * u.w
        let sec = t(CrossSection.circle(u.w * 1.01, segments))
        for (const deg of notches) {
          const a = (deg * Math.PI) / 180
          sec = t(sec.subtract(t(t(CrossSection.circle(rho, 32)).translate(dist * Math.cos(a), dist * Math.sin(a)))))
        }
        const prism = t(t(Manifold.extrude(sec, yMax - yMin + 2)).translate(0, 0, yMin - 1))
        body = t(body.intersect(prism))
      }

      // 3. ユニット同士をつなぐ中心スパイン（円錐台, 隣とわずかに重ねる）
      const spineR = p.spineRatio * u.w
      const spine = t(t(Manifold.cylinder(u.h * 1.04, spineR, spineR * u.t, 32)).translate(0, 0, -0.02 * u.h))
      body = t(body.add(spine))

      // 4. 根元の取付ベース（下の円錐を埋めて平らな底面にする）
      if (u.i === 0 && baseT > 0) {
        const top = Math.max(0, u.w * g.tu)
        const base = t(t(Manifold.cylinder(top - yMin + baseT, u.w, u.w, segments)).translate(0, 0, yMin - baseT))
        body = t(body.add(base))
      }

      // 5. ケーブル穴（円錐母線に沿って内向きに傾いた円柱）
      if (u.hole === 'inner') {
        const beta = Math.atan(u.A)
        const y0 = (u.i === 0 ? yMin - baseT : yMin) - 1
        const y1 = yMax + 1
        const x0 = p.cableRatio * u.w * (1 - ((1 - u.t) * y0) / u.h)
        const len = (y1 - y0) / Math.cos(beta)
        for (let j = 0; j < p.cableCount; j++) {
          const hole = t(t(t(t(Manifold.cylinder(len, g.rh, g.rh, 16)).rotate([0, (-beta * 180) / Math.PI, 0]))
            .translate([x0, 0, y0])).rotate([0, 0, cableAngle(j, p.cableCount)]))
          body = t(body.subtract(hole))
        }
      }

      // 5'. 外付けガイド：縁の外側に穴付きの突起。上下面は円錐面を延長した形なので、曲げても隣と同時にしか当たらない
      if (u.hole === 'outer') {
        const { R, r1 } = earDims(u, g)
        const ext = t(Manifold.revolve(t(new CrossSection([[[0, 0], [r1, r1 * g.tu], [r1, u.h - r1 * g.tp], [0, u.h]]])), segments))
        const lo = Math.min(0, r1 * g.tu) - 1
        const hi = Math.max(u.h, u.h - r1 * g.tp) + 1
        for (let j = 0; j < p.cableCount; j++) {
          const a = cableAngle(j, p.cableCount)
          const boss = t(t(t(Manifold.cylinder(hi - lo, r1 - R, r1 - R, 24)).translate([R, 0, lo])).rotate([0, 0, a]))
          body = t(body.add(t(boss.intersect(ext))))
        }
        for (let j = 0; j < p.cableCount; j++) {
          const a = cableAngle(j, p.cableCount)
          const hole = t(t(t(Manifold.cylinder(hi - lo, g.rh, g.rh, 16)).translate([R, 0, lo])).rotate([0, 0, a]))
          body = t(body.subtract(hole))
        }
      }

      units.push(meshOf(body))
      placed.push(t(body.translate(0, 0, u.z)))
    }

    let merged = t(Manifold.union(placed))
    const zMin = merged.boundingBox().min[2]
    merged = t(merged.translate(0, 0, -zMin))
    const status = merged.status()
    if (status !== 'NoError' && status !== 0) throw new Error(`manifold status: ${status}`)
    return { units, merged: meshOf(merged), volume: merged.volume() }
  } finally {
    for (const obj of trash) obj.delete()
  }
}

// ── 書き出し ────────────────────────────────────────────────────────────────

export function toStl({ positions, indices }) {
  const triCount = indices.length / 3
  const buf = new ArrayBuffer(84 + triCount * 50)
  const view = new DataView(buf)
  const header = 'SpiMan tentacle (binary STL, mm)'
  for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i))
  view.setUint32(80, triCount, true)
  let off = 84
  for (let t = 0; t < triCount; t++) {
    const a = indices[t * 3] * 3, b = indices[t * 3 + 1] * 3, c = indices[t * 3 + 2] * 3
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2]
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len; ny /= len; nz /= len
    for (const v of [nx, ny, nz]) { view.setFloat32(off, v, true); off += 4 }
    for (const i of [a, b, c]) {
      view.setFloat32(off, positions[i], true)
      view.setFloat32(off + 4, positions[i + 1], true)
      view.setFloat32(off + 8, positions[i + 2], true)
      off += 12
    }
    off += 2
  }
  return new Blob([buf], { type: 'model/stl' })
}

export async function to3mf({ positions, indices }) {
  const { default: JSZip } = await import('jszip')
  const verts = []
  for (let i = 0; i < positions.length; i += 3) {
    verts.push(`<vertex x="${positions[i].toFixed(4)}" y="${positions[i + 1].toFixed(4)}" z="${positions[i + 2].toFixed(4)}"/>`)
  }
  const tris = []
  for (let i = 0; i < indices.length; i += 3) {
    tris.push(`<triangle v1="${indices[i]}" v2="${indices[i + 1]}" v3="${indices[i + 2]}"/>`)
  }
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" name="SpiMan" type="model">
      <mesh>
        <vertices>${verts.join('')}</vertices>
        <triangles>${tris.join('')}</triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1"/>
  </build>
</model>`
  const zip = new JSZip()
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`)
  zip.file('3D/3dmodel.model', model)
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}
