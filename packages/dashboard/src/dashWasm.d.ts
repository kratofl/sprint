// Types for dashWasm.js, the glue around the wheel-dash renderer's WebAssembly build.

/** What a render says beyond the pixels. */
export interface DashRenderInfo {
  /** True while the picture can change without a new frame (live renders only: a banner is up, the lap timer holds a lap). */
  timeDependent: boolean
}

/**
 * Compiles the module once. `source` is the .wasm file: its bytes, a fetch Response (or the
 * promise of one), or an already compiled module.
 */
export function loadDashWasm(source: WebAssembly.Module | BufferSource | Response | PromiseLike<Response>): Promise<DashWasm>

/**
 * One dash renderer. Every input is JSON text: the scene is
 * `{ layout, width, height, scale?, pageId?, idle?, settings?, targets?, transparent? }` (logical
 * px; the picture is `width * scale` by `height * scale` device px), a frame is the host's
 * telemetry JSON (`toHostFrame` makes one from a `@sprint/types` frame), a banner a `DashAlertBanner`. Calls throw an Error with the renderer's message on
 * failure; after a crash the next call starts over on a fresh instance with the last good scene.
 */
export class DashWasm {
  constructor(module: WebAssembly.Module)
  /** Sets the scene. On an error the previous scene stays. */
  setScene(sceneJson: string): void
  /** A still picture: exactly the given banner ('' for none), no alert history. */
  renderStill(frameJson: string, bannerJson: string, nowMs: number): DashRenderInfo
  /** A live picture: alerts are tracked from the frames seen so far ('' or 'null' is no data). */
  renderLive(frameJson: string, nowMs: number): DashRenderInfo
  /** The picture's size in device pixels (0 before the first scene). */
  readonly width: number
  readonly height: number
  /** The last picture as premultiplied RGBA: a view into the module's memory, valid until the next call. */
  pixels(): Uint8Array<ArrayBuffer>
  /** The last picture as straight RGBA, copied: what a canvas `ImageData` holds. */
  imagePixels(): Uint8ClampedArray<ArrayBuffer>
  /** Frees the renderer. A later call starts a fresh one (without a scene). */
  dispose(): void
}
