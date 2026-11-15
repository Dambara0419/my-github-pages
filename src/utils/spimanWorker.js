// SpiMan のソリッド生成を UI スレッドから切り離すワーカー（1 回 0.3〜1 秒かかるため）
import { derive } from './spiman.js'
import { buildSolid, loadManifold } from './spimanSolid.js'

self.onmessage = async (e) => {
  const { id, params } = e.data
  try {
    const wasm = await loadManifold()
    const g = derive(params)
    const result = buildSolid(wasm, params, g)
    const transfer = [result.merged.positions.buffer, result.merged.indices.buffer]
    for (const u of result.units) transfer.push(u.positions.buffer, u.indices.buffer)
    self.postMessage({ id, result }, transfer)
  } catch (err) {
    self.postMessage({ id, error: String(err?.message ?? err) })
  }
}
