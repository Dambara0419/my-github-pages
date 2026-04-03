import { useRef, useState, useEffect, useCallback } from 'react'
import JSZip from 'jszip'

const DISPLAY = 400   // canvas display size (px)
const RES = 500       // mesh resolution: 500×500 = 0.2mm/px
const MM = 100        // print area mm
const PX_MM = MM / RES // 0.2mm per pixel

// ── K-means++ (サンプリングで高速化) ──────────────────────────────────────
function kmeans(pixels, k, maxIter = 30) {
  const n = pixels.length / 3

  // 10K サンプルで重心を求め、最後に全ピクセル割り当て
  const step = Math.max(1, Math.floor(n / 10000))
  const sn = Math.ceil(n / step)
  const sp = new Uint8Array(sn * 3)
  for (let i = 0; i < sn; i++) {
    sp[i*3] = pixels[i*step*3]; sp[i*3+1] = pixels[i*step*3+1]; sp[i*3+2] = pixels[i*step*3+2]
  }

  // K-means++ 初期化
  const used = new Set()
  const fi = Math.floor(Math.random() * sn)
  used.add(fi)
  const centroids = [[sp[fi*3], sp[fi*3+1], sp[fi*3+2]]]

  while (centroids.length < k) {
    const dists = new Float32Array(sn)
    let total = 0
    for (let i = 0; i < sn; i++) {
      let minD = Infinity
      for (const c of centroids) {
        const dr = sp[i*3]-c[0], dg = sp[i*3+1]-c[1], db = sp[i*3+2]-c[2]
        const d = dr*dr + dg*dg + db*db
        if (d < minD) minD = d
      }
      dists[i] = minD; total += minD
    }
    let r = Math.random() * total
    let picked = false
    for (let i = 0; i < sn; i++) {
      r -= dists[i]
      if (r <= 0 && !used.has(i)) { used.add(i); centroids.push([sp[i*3], sp[i*3+1], sp[i*3+2]]); picked = true; break }
    }
    if (!picked) {
      for (let i = 0; i < sn; i++) {
        if (!used.has(i)) { used.add(i); centroids.push([sp[i*3], sp[i*3+1], sp[i*3+2]]); break }
      }
    }
  }

  // サンプル上で反復
  const sa = new Int32Array(sn)
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false
    for (let i = 0; i < sn; i++) {
      const r = sp[i*3], g = sp[i*3+1], b = sp[i*3+2]
      let best = 0, bestD = Infinity
      for (let c = 0; c < k; c++) {
        const dr = r-centroids[c][0], dg = g-centroids[c][1], db = b-centroids[c][2]
        const d = dr*dr + dg*dg + db*db
        if (d < bestD) { bestD = d; best = c }
      }
      if (sa[i] !== best) { sa[i] = best; changed = true }
    }
    if (!changed) break
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0])
    for (let i = 0; i < sn; i++) {
      const c = sa[i]
      sums[c][0] += sp[i*3]; sums[c][1] += sp[i*3+1]; sums[c][2] += sp[i*3+2]; sums[c][3]++
    }
    for (let c = 0; c < k; c++) {
      if (sums[c][3] > 0) centroids[c] = [sums[c][0]/sums[c][3], sums[c][1]/sums[c][3], sums[c][2]/sums[c][3]]
    }
  }

  // 全ピクセルを最終重心に割り当て
  const assignments = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    const r = pixels[i*3], g = pixels[i*3+1], b = pixels[i*3+2]
    let best = 0, bestD = Infinity
    for (let c = 0; c < k; c++) {
      const dr = r-centroids[c][0], dg = g-centroids[c][1], db = b-centroids[c][2]
      const d = dr*dr + dg*dg + db*db
      if (d < bestD) { bestD = d; best = c }
    }
    assignments[i] = best
  }

  return { palette: centroids.map(c => c.map(Math.round)), assignments }
}

// ── Mesh ──────────────────────────────────────────────────────────────────
function box(x0, y0, z0, x1, y1, z1, vo) {
  const v = [
    [x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],
    [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],
  ]
  const t = [
    [vo,vo+2,vo+1],[vo,vo+3,vo+2],
    [vo+4,vo+5,vo+6],[vo+4,vo+6,vo+7],
    [vo,vo+1,vo+5],[vo,vo+5,vo+4],
    [vo+1,vo+2,vo+6],[vo+1,vo+6,vo+5],
    [vo+2,vo+3,vo+7],[vo+2,vo+7,vo+6],
    [vo+3,vo,vo+4],[vo+3,vo+4,vo+7],
  ]
  return { v, t }
}

function buildColorMesh(assignments, colorIdx, zBase, zTop) {
  const verts = [], tris = []
  for (let y = 0; y < RES; y++) {
    let sx = -1
    for (let x = 0; x <= RES; x++) {
      const hit = x < RES && assignments[y * RES + x] === colorIdx
      if (hit && sx === -1) { sx = x }
      else if (!hit && sx !== -1) {
        const { v, t } = box(sx*PX_MM, y*PX_MM, zBase, x*PX_MM, (y+1)*PX_MM, zTop, verts.length)
        verts.push(...v); tris.push(...t); sx = -1
      }
    }
  }
  return { verts, tris }
}

// ── 3MF ───────────────────────────────────────────────────────────────────
function meshXML(verts, tris, id, name) {
  const vs = verts.map(([x,y,z]) => `        <vertex x="${x.toFixed(3)}" y="${y.toFixed(3)}" z="${z.toFixed(3)}"/>`).join('\n')
  const ts = tris.map(([a,b,c]) => `        <triangle v1="${a}" v2="${b}" v3="${c}"/>`).join('\n')
  return `    <object id="${id}" name="${name}" type="model">
      <mesh>
        <vertices>
${vs}
        </vertices>
        <triangles>
${ts}
        </triangles>
      </mesh>
    </object>`
}

async function build3MF(assignments, palette) {
  const objects = []
  for (let c = 0; c < palette.length; c++) {
    const mesh = buildColorMesh(assignments, c, 0.0, 1.0)
    if (mesh.verts.length > 0) objects.push({ mesh, name: `color_${c+1}` })
  }

  const objsXML = objects.map((o, i) => meshXML(o.mesh.verts, o.mesh.tris, i+1, o.name)).join('\n')
  const buildXML = objects.map((_, i) => `    <item objectid="${i+1}"/>`).join('\n')

  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
${objsXML}
  </resources>
  <build>
${buildXML}
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

// ── Component ─────────────────────────────────────────────────────────────
export default function Img2Obj() {
  const canvasRef = useRef(null)
  const previewRef = useRef(null)  // 常にDOMに存在させる（条件付きレンダリングしない）
  const fileInputRef = useRef(null)
  const imgRef = useRef(null)
  const dragRef = useRef({ active: false, startX: 0, startY: 0, ox: 0, oy: 0 })

  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [numColors, setNumColors] = useState(4)
  const [result, setResult] = useState(null)
  const [status, setStatus] = useState('')
  const [hasImage, setHasImage] = useState(false)

  const draw = useCallback((tx) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, DISPLAY, DISPLAY)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, DISPLAY, DISPLAY)
    if (imgRef.current) {
      ctx.save()
      ctx.translate(tx.x, tx.y)
      ctx.scale(tx.scale, tx.scale)
      ctx.drawImage(imgRef.current, 0, 0)
      ctx.restore()
    }
    ctx.strokeStyle = '#646cff'
    ctx.lineWidth = 2
    ctx.strokeRect(1, 1, DISPLAY - 2, DISPLAY - 2)
  }, [])

  useEffect(() => { draw(transform) }, [transform, draw])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const f = e.deltaY < 0 ? 1.1 : 0.9
      setTransform(t => ({ scale: t.scale * f, x: mx - (mx - t.x) * f, y: my - (my - t.y) * f }))
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  const fitImage = (img, fill = false) => {
    const s = fill
      ? Math.max(DISPLAY / img.width, DISPLAY / img.height)
      : Math.min(DISPLAY / img.width, DISPLAY / img.height)
    setTransform({ scale: s, x: (DISPLAY - img.width * s) / 2, y: (DISPLAY - img.height * s) / 2 })
  }

  const handleUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      fitImage(img)
      setHasImage(true)
      setResult(null)
      setStatus('')
    }
    img.src = url
  }

  const onMouseDown = (e) => {
    if (!imgRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    dragRef.current = { active: true, startX: e.clientX - rect.left, startY: e.clientY - rect.top, ox: transform.x, oy: transform.y }
  }
  const onMouseMove = (e) => {
    if (!dragRef.current.active) return
    const rect = canvasRef.current.getBoundingClientRect()
    const dx = (e.clientX - rect.left) - dragRef.current.startX
    const dy = (e.clientY - rect.top) - dragRef.current.startY
    setTransform(t => ({ ...t, x: dragRef.current.ox + dx, y: dragRef.current.oy + dy }))
  }
  const onMouseUp = () => { dragRef.current.active = false }

  const getCroppedPixels = () => {
    const off = document.createElement('canvas')
    off.width = RES; off.height = RES
    const ctx = off.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, RES, RES)
    const r = RES / DISPLAY
    ctx.save()
    ctx.translate(transform.x * r, transform.y * r)
    ctx.scale(transform.scale * r, transform.scale * r)
    ctx.drawImage(imgRef.current, 0, 0)
    ctx.restore()
    const d = ctx.getImageData(0, 0, RES, RES)
    const px = new Uint8Array(RES * RES * 3)
    for (let i = 0; i < RES * RES; i++) { px[i*3] = d.data[i*4]; px[i*3+1] = d.data[i*4+1]; px[i*3+2] = d.data[i*4+2] }
    return px
  }

  const handlePreview = async () => {
    if (!hasImage) return
    setStatus('processing')
    await new Promise(r => setTimeout(r, 20))

    const pixels = getCroppedPixels()
    const { palette, assignments } = kmeans(pixels, numColors)

    // canvas は常にDOMにあるので setResult 前に描画しても安全
    const ctx = previewRef.current.getContext('2d')
    const imgData = ctx.createImageData(RES, RES)
    for (let i = 0; i < RES * RES; i++) {
      const c = palette[assignments[i]]
      imgData.data[i*4] = c[0]; imgData.data[i*4+1] = c[1]; imgData.data[i*4+2] = c[2]; imgData.data[i*4+3] = 255
    }
    ctx.putImageData(imgData, 0, 0)

    setResult({ palette, assignments })
    setStatus('done')
  }

  const handleDownload = async () => {
    if (!result) return
    setStatus('processing')
    await new Promise(r => setTimeout(r, 20))
    const blob = await build3MF(result.assignments, result.palette)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'img2obj.3mf'
    a.click()
    setStatus('done')
  }

  const isProcessing = status === 'processing'

  return (
    <div className="min-h-screen p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-1">img2obj</h1>
      <p className="text-gray-400 mb-6 text-sm">画像 → マルチカラー 3MF (Bambu Lab AMS用) | 100×100mm / 厚み 1mm</p>

      <div className="flex flex-wrap gap-8">
        {/* ─ Canvas ─ */}
        <div>
          <div className="flex gap-2 mb-2 flex-wrap">
            <button onClick={() => fileInputRef.current.click()}>画像を選択</button>
            <button onClick={() => imgRef.current && fitImage(imgRef.current)} disabled={!hasImage}>Fit</button>
            <button onClick={() => imgRef.current && fitImage(imgRef.current, true)} disabled={!hasImage}>Fill</button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          </div>
          <canvas
            ref={canvasRef}
            width={DISPLAY}
            height={DISPLAY}
            style={{ cursor: 'grab', display: 'block' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          />
          <p className="text-xs text-gray-500 mt-1">ドラッグ: 移動 ／ スクロール: ズーム ／ 枠内 = 印刷範囲</p>
        </div>

        {/* ─ Controls ─ */}
        <div className="flex flex-col gap-4 min-w-48">
          <div>
            <p className="mb-2 font-medium text-sm">色数を選択</p>
            <div className="flex gap-2">
              {[1,2,3,4].map(n => (
                <button
                  key={n}
                  onClick={() => { setNumColors(n); setResult(null); setStatus('') }}
                  style={{ borderColor: numColors === n ? '#646cff' : 'transparent', borderWidth: 2 }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <button onClick={handlePreview} disabled={!hasImage || isProcessing}>
            {isProcessing ? '処理中...' : 'プレビュー生成'}
          </button>

          {/* 常に1つだけDOMに存在。result の有無でCSSのみ切り替え */}
          <div style={{ display: result ? 'block' : 'none' }}>
            <p className="text-xs text-gray-400 mb-2">量子化プレビュー</p>
          </div>
          <canvas
            ref={previewRef}
            width={RES}
            height={RES}
            style={{ width: 200, height: 200, imageRendering: 'pixelated', display: result ? 'block' : 'none' }}
            className="border border-gray-600"
          />

          {result && (
            <>
              <div>
                <p className="text-xs text-gray-400 mb-2">カラーパレット（AMSスロット順）</p>
                <div className="flex gap-2">
                  {result.palette.map((c, i) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <div style={{ background: `rgb(${c[0]},${c[1]},${c[2]})`, width: 32, height: 32, borderRadius: 4, border: '1px solid #555' }} />
                      <span className="text-xs">#{i+1}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={handleDownload} disabled={isProcessing}>
                3MF をダウンロード
              </button>
              <p className="text-xs text-gray-500">
                BambuStudioで開き、各オブジェクトにAMSスロットを割り当ててください。
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
