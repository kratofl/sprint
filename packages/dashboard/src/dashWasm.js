// The wheel-dash renderer (packages/dashboard/renderer, Rust) compiled to WebAssembly, driven
// through the C ABI in renderer/src/ffi.rs. Plain JavaScript with no imports, so it runs as is in
// the desktop app (through DashCanvas.tsx), in Node (the tests) and in a static page that loads
// it directly; dashWasm.d.ts types it.
//
// Every input is UTF-8 JSON copied into the module's memory (sd_alloc / sd_dealloc). A failed
// call throws an Error with the renderer's own message. A Rust panic aborts in WebAssembly, which
// traps the instance: that call throws, the instance is dropped, and the next call starts a fresh
// one from the compiled module and sets the last good scene on it again.

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * Compiles the module once. `source` is the .wasm file: its bytes, a fetch Response (or the
 * promise of one), or an already compiled module.
 */
export async function loadDashWasm(source) {
  if (source instanceof WebAssembly.Module) return new DashWasm(source)
  const resolved = await source
  let bytes = resolved
  if (typeof Response !== 'undefined' && resolved instanceof Response) {
    if (!resolved.ok) throw new Error(`the dash renderer could not be loaded (HTTP ${resolved.status})`)
    bytes = await resolved.arrayBuffer()
  }
  return new DashWasm(await WebAssembly.compile(bytes))
}

/** One dash renderer: a scene (layout, size, page, ...) and the last picture drawn with it. */
export class DashWasm {
  #module
  /** The live instance's exports, or null until the first call and after a crash. */
  #exports = null
  /** The renderer pointer inside that instance. */
  #renderer = 0
  /** The last scene that was set, as bytes, to set again on a fresh instance. */
  #scene = null

  constructor(module) {
    this.#module = module
  }

  /** Sets the scene (JSON text). On an error the previous scene stays. */
  setScene(sceneJson) {
    const bytes = encoder.encode(sceneJson)
    this.#call((x, r) => withInput(x, bytes, (ptr, len) => x.sd_set_scene(r, ptr, len)))
    this.#scene = bytes
  }

  /** A still picture: exactly the given banner (JSON, '' for none), no alert history. */
  renderStill(frameJson, bannerJson, nowMs) {
    const frame = encoder.encode(frameJson)
    const banner = encoder.encode(bannerJson)
    const code = this.#call((x, r) =>
      withInput(x, frame, (framePtr, frameLen) => withInput(x, banner, (bannerPtr, bannerLen) => x.sd_render_still(r, framePtr, frameLen, bannerPtr, bannerLen, nowMs))),
    )
    return { timeDependent: (code & 1) === 1 }
  }

  /** A live picture: alerts are tracked from the frames seen so far ('' or 'null' is no data). */
  renderLive(frameJson, nowMs) {
    const frame = encoder.encode(frameJson)
    const code = this.#call((x, r) => withInput(x, frame, (ptr, len) => x.sd_render_live(r, ptr, len, nowMs)))
    return { timeDependent: (code & 1) === 1 }
  }

  /** The picture's width in device pixels (0 before the first scene). */
  get width() {
    return this.#exports ? this.#exports.sd_width(this.#renderer) >>> 0 : 0
  }

  /** The picture's height in device pixels (0 before the first scene). */
  get height() {
    return this.#exports ? this.#exports.sd_height(this.#renderer) >>> 0 : 0
  }

  /** The last picture as premultiplied RGBA: a view into the module's memory, valid until the next call. */
  pixels() {
    const x = this.#exports
    const ptr = x ? x.sd_pixels(this.#renderer) >>> 0 : 0
    if (!x || ptr === 0) return new Uint8Array(0)
    return new Uint8Array(x.memory.buffer, ptr, this.width * this.height * 4)
  }

  /**
   * The last picture as straight (not premultiplied) RGBA, copied: what a canvas `ImageData`
   * holds. The same bytes as `pixels()` wherever the picture is opaque, which it is unless the
   * scene asked for a transparent background.
   */
  imagePixels() {
    const premultiplied = this.pixels()
    const out = new Uint8ClampedArray(premultiplied)
    for (let i = 3; i < out.length; i += 4) {
      const alpha = out[i]
      if (alpha === 255 || alpha === 0) continue
      const scale = 255 / alpha
      out[i - 3] = Math.round(out[i - 3] * scale)
      out[i - 2] = Math.round(out[i - 2] * scale)
      out[i - 1] = Math.round(out[i - 1] * scale)
    }
    return out
  }

  /** Frees the renderer. A later call starts a fresh one (without a scene). */
  dispose() {
    if (this.#exports && this.#renderer !== 0) this.#exports.sd_free(this.#renderer)
    this.#exports = null
    this.#renderer = 0
    this.#scene = null
  }

  /** The live instance, started (and given the last good scene) when there is none. */
  #live() {
    if (this.#exports) return this.#exports
    const x = new WebAssembly.Instance(this.#module, {}).exports
    const renderer = x.sd_new()
    if (renderer === 0) throw new Error('the dash renderer could not start')
    this.#exports = x
    this.#renderer = renderer
    const scene = this.#scene
    if (scene) this.#call((y, r) => withInput(y, scene, (ptr, len) => y.sd_set_scene(r, ptr, len)))
    return x
  }

  /** Runs one ABI call; a negative code throws the renderer's message, a trap drops the instance. */
  #call(body) {
    const x = this.#live()
    let code
    try {
      code = body(x, this.#renderer)
    } catch (error) {
      // A trap (or anything else thrown mid-call) may leave the instance's memory half written:
      // never call into it again.
      this.#exports = null
      this.#renderer = 0
      throw new Error(`the dash renderer crashed: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
    if (code < 0) throw new Error(lastError(x, this.#renderer) || `the dash renderer failed (code ${code})`)
    return code
  }
}

/** Copies `bytes` into the module's memory for the length of `use(ptr, len)`; empty input is (0, 0). */
function withInput(x, bytes, use) {
  if (bytes.length === 0) return use(0, 0)
  const ptr = x.sd_alloc(bytes.length) >>> 0
  if (ptr === 0) throw new Error('out of memory')
  new Uint8Array(x.memory.buffer, ptr, bytes.length).set(bytes)
  // Not freed when `use` throws: the instance is dropped then anyway.
  const result = use(ptr, bytes.length)
  x.sd_dealloc(ptr, bytes.length)
  return result
}

/** The renderer's message for its last failure. */
function lastError(x, renderer) {
  const length = x.sd_last_error(renderer, 0, 0) >>> 0
  if (length === 0) return ''
  const ptr = x.sd_alloc(length) >>> 0
  if (ptr === 0) return ''
  x.sd_last_error(renderer, ptr, length)
  const message = decoder.decode(new Uint8Array(x.memory.buffer, ptr, length))
  x.sd_dealloc(ptr, length)
  return message
}
