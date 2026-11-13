// The C ABI, shared by the native library (the .NET host P/Invokes it) and the WASM build (plain
// exports driven by hand-written JS glue). The only module with `unsafe`.
//
// Conventions:
// - A renderer is an opaque pointer from `sd_new`, freed with `sd_free`.
// - Input is (pointer, length) UTF-8 JSON. A null pointer with length 0 is an empty input.
// - Calls return >= 0 on success (bit 0 = `time_dependent` for the render calls) and a negative
//   `SD_ERR_*` code on failure; `sd_last_error` then holds the message.
// - Every entry point catches panics, so a bug becomes an error code instead of unwinding into
//   the caller.
// - Pixels are premultiplied RGBA8 (`sd_pixels`), or BGRA8 copied out with `sd_copy_bgra`.

use std::panic::{AssertUnwindSafe, catch_unwind};

use crate::{RenderError, RenderInfo, Renderer};

/// The renderer pointer was null.
pub const SD_ERR_NULL: i32 = -1;
/// The input could not be drawn (bad JSON, no scene, a malformed banner, ...).
pub const SD_ERR_INPUT: i32 = -2;
/// The renderer panicked; the message is in `sd_last_error`.
pub const SD_ERR_PANIC: i32 = -3;
/// The output buffer is too small.
pub const SD_ERR_BUFFER: i32 = -4;
/// A pointer argument was null while its length was not 0.
pub const SD_ERR_POINTER: i32 = -5;

/// A renderer as the C side holds it: the renderer plus the last failure's message.
pub struct SdRenderer {
    renderer: Renderer,
    last_error: String,
}

/// Runs `body` on the renderer behind `r`, turning a panic or an error into a code and a message.
fn with_renderer(r: *mut SdRenderer, body: impl FnOnce(&mut Renderer) -> Result<i32, (i32, String)>) -> i32 {
    // SAFETY: `r` is null or a pointer from `sd_new` not yet passed to `sd_free`; the caller
    // never uses one renderer from two threads at once.
    let Some(sd) = (unsafe { r.as_mut() }) else {
        return SD_ERR_NULL;
    };
    match catch_unwind(AssertUnwindSafe(|| body(&mut sd.renderer))) {
        Ok(Ok(code)) => code,
        Ok(Err((code, message))) => {
            sd.last_error = message;
            code
        }
        Err(panic) => {
            let message = panic
                .downcast_ref::<&str>()
                .map(|s| (*s).to_owned())
                .or_else(|| panic.downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "unknown panic".to_owned());
            sd.last_error = format!("renderer panicked: {message}");
            SD_ERR_PANIC
        }
    }
}

/// (pointer, length) as a byte slice; `None` for a null pointer with a non-zero length.
///
/// # Safety
/// `ptr` must be null or point to `len` readable bytes that stay valid for `'a`.
unsafe fn bytes<'a>(ptr: *const u8, len: usize) -> Option<&'a [u8]> {
    if len == 0 {
        Some(&[])
    } else if ptr.is_null() {
        None
    } else {
        // SAFETY: the caller guarantees `len` readable bytes at `ptr`.
        Some(unsafe { std::slice::from_raw_parts(ptr, len) })
    }
}

fn input_error(error: RenderError) -> (i32, String) {
    (SD_ERR_INPUT, error.to_string())
}

fn pointer_error() -> (i32, String) {
    (SD_ERR_POINTER, "a pointer argument was null with a non-zero length".to_owned())
}

fn info_code(info: RenderInfo) -> i32 {
    i32::from(info.time_dependent)
}

/// A new renderer, or null if one could not be created.
#[unsafe(no_mangle)]
pub extern "C" fn sd_new() -> *mut SdRenderer {
    catch_unwind(|| Box::into_raw(Box::new(SdRenderer { renderer: Renderer::new(), last_error: String::new() }))).unwrap_or(std::ptr::null_mut())
}

/// Frees a renderer from `sd_new`. Null is ignored.
///
/// # Safety
/// `r` must be null or a pointer from `sd_new` that is not used again.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sd_free(r: *mut SdRenderer) {
    if !r.is_null() {
        // SAFETY: `r` came from `Box::into_raw` in `sd_new` and is freed once.
        let boxed = unsafe { Box::from_raw(r) };
        let _ = catch_unwind(AssertUnwindSafe(move || drop(boxed)));
    }
}

/// Sets the scene (layout, size, page, ... as JSON). 0 on success.
///
/// # Safety
/// `r` as for `sd_free`; `ptr` must be null or point to `len` readable bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sd_set_scene(r: *mut SdRenderer, ptr: *const u8, len: usize) -> i32 {
    // SAFETY: forwarded from the caller's contract.
    let input = unsafe { bytes(ptr, len) };
    with_renderer(r, |renderer| {
        let json = input.ok_or_else(pointer_error)?;
        renderer.set_scene(json).map(|()| 0).map_err(input_error)
    })
}

/// Sets the wheel's multi-dial reading (JSON; empty or `null` = no dial). 0 on success.
///
/// # Safety
/// As for `sd_set_scene`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sd_set_multi_dial(r: *mut SdRenderer, ptr: *const u8, len: usize) -> i32 {
    // SAFETY: forwarded from the caller's contract.
    let input = unsafe { bytes(ptr, len) };
    with_renderer(r, |renderer| {
        let json = input.ok_or_else(pointer_error)?;
        renderer.set_multi_dial(json).map(|()| 0).map_err(input_error)
    })
}

/// Renders a live frame (JSON; empty or `null` = no data) at `now_ms`.
///
/// # Safety
/// As for `sd_set_scene`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sd_render_live(r: *mut SdRenderer, ptr: *const u8, len: usize, now_ms: f64) -> i32 {
    // SAFETY: forwarded from the caller's contract.
    let frame = unsafe { bytes(ptr, len) };
    with_renderer(r, |renderer| {
        let frame = frame.ok_or_else(pointer_error)?;
        renderer.render_live(frame, now_ms).map(info_code).map_err(input_error)
    })
}

/// Renders a still: a frame and an optional banner (empty or `null` = none), no history.
///
/// # Safety
/// As for `sd_set_scene`, for both (pointer, length) pairs.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sd_render_still(
    r: *mut SdRenderer,
    frame_ptr: *const u8,
    frame_len: usize,
    banner_ptr: *const u8,
    banner_len: usize,
    now_ms: f64,
) -> i32 {
    // SAFETY: forwarded from the caller's contract.
    let (frame, banner) = unsafe { (bytes(frame_ptr, frame_len), bytes(banner_ptr, banner_len)) };
    with_renderer(r, |renderer| {
        let (frame, banner) = (frame.ok_or_else(pointer_error)?, banner.ok_or_else(pointer_error)?);
        let banner = (!banner.is_empty()).then_some(banner);
        renderer.render_still(frame, banner, now_ms).map(info_code).map_err(input_error)
    })
}

/// The last picture: premultiplied RGBA8, `sd_width * sd_height * 4` bytes, valid until the next
/// call on this renderer. Null before the first scene or for a null renderer.
///
/// # Safety
/// `r` as for `sd_free`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sd_pixels(r: *const SdRenderer) -> *const u8 {
    // SAFETY: `r` is null or a live renderer from `sd_new`.
    match unsafe { r.as_ref() } {
        Some(sd) if !sd.renderer.pixels().is_empty() => sd.renderer.pixels().as_ptr(),
        _ => std::ptr::null(),
    }
}

/// The pixmap width in device px (0 before the first scene or for a null renderer).
///
/// # Safety
/// `r` as for `sd_free`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sd_width(r: *const SdRenderer) -> u32 {
    // SAFETY: `r` is null or a live renderer from `sd_new`.
    unsafe { r.as_ref() }.map_or(0, |sd| sd.renderer.size_px().0)
}

/// The pixmap height in device px (0 before the first scene or for a null renderer).
///
/// # Safety
/// `r` as for `sd_free`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sd_height(r: *const SdRenderer) -> u32 {
    // SAFETY: `r` is null or a live renderer from `sd_new`.
    unsafe { r.as_ref() }.map_or(0, |sd| sd.renderer.size_px().1)
}

/// Copies the last picture into `out` as premultiplied BGRA8 (the host's pixel order). Returns
/// the bytes written, or `SD_ERR_BUFFER` when `out_len` is smaller than `width * height * 4`.
///
/// # Safety
/// `r` as for `sd_free`; `out` must be null or point to `out_len` writable bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sd_copy_bgra(r: *mut SdRenderer, out: *mut u8, out_len: usize) -> i32 {
    with_renderer(r, |renderer| {
        let pixels = renderer.pixels();
        if out_len < pixels.len() {
            return Err((SD_ERR_BUFFER, format!("output buffer holds {out_len} bytes, the picture needs {}", pixels.len())));
        }
        if pixels.is_empty() {
            return Ok(0);
        }
        if out.is_null() {
            return Err(pointer_error());
        }
        // SAFETY: `out` points to at least `out_len >= pixels.len()` writable bytes.
        let target = unsafe { std::slice::from_raw_parts_mut(out, pixels.len()) };
        for (dst, src) in target.as_chunks_mut::<4>().0.iter_mut().zip(pixels.as_chunks::<4>().0) {
            *dst = [src[2], src[1], src[0], src[3]];
        }
        i32::try_from(pixels.len()).map_err(|_| (SD_ERR_BUFFER, "the picture is larger than 2 GB".to_owned()))
    })
}

/// Copies the last failure's message (UTF-8, not NUL-terminated) into `out`, truncated to
/// `out_len`. Returns the message's full length, so a caller can size its buffer; 0 when there is
/// no message or for a null renderer.
///
/// # Safety
/// `r` as for `sd_free`; `out` must be null or point to `out_len` writable bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sd_last_error(r: *const SdRenderer, out: *mut u8, out_len: usize) -> usize {
    // SAFETY: `r` is null or a live renderer from `sd_new`.
    let Some(sd) = (unsafe { r.as_ref() }) else {
        return 0;
    };
    let message = sd.last_error.as_bytes();
    if !out.is_null() && out_len > 0 {
        let n = message.len().min(out_len);
        // SAFETY: `out` points to `out_len >= n` writable bytes, which cannot overlap the message.
        unsafe { std::ptr::copy_nonoverlapping(message.as_ptr(), out, n) };
    }
    message.len()
}

/// Allocates `len` bytes for a caller (WASM JS glue) to place input in; null for 0 or on failure.
#[unsafe(no_mangle)]
pub extern "C" fn sd_alloc(len: usize) -> *mut u8 {
    let Ok(layout) = std::alloc::Layout::array::<u8>(len) else {
        return std::ptr::null_mut();
    };
    if layout.size() == 0 {
        return std::ptr::null_mut();
    }
    // SAFETY: the layout has a non-zero size.
    unsafe { std::alloc::alloc(layout) }
}

/// Frees bytes from `sd_alloc`. Null is ignored.
///
/// # Safety
/// `ptr` must be null or come from `sd_alloc(len)` with this same `len`, and not be used again.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sd_dealloc(ptr: *mut u8, len: usize) {
    if ptr.is_null() {
        return;
    }
    if let Ok(layout) = std::alloc::Layout::array::<u8>(len) {
        // SAFETY: `ptr` was allocated by `sd_alloc` with this layout.
        unsafe { std::alloc::dealloc(ptr, layout) };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCENE: &[u8] = br#"{"layout":{"id":"l","name":"L","gridCols":20,"gridRows":12,"pages":[{"id":"p","name":"P","widgets":[]}]},"width":4,"height":2}"#;

    fn last_error(r: *const SdRenderer) -> String {
        let mut buf = [0u8; 256];
        // SAFETY: a live renderer and a 256-byte buffer.
        let n = unsafe { sd_last_error(r, buf.as_mut_ptr(), buf.len()) };
        String::from_utf8_lossy(&buf[..n.min(buf.len())]).into_owned()
    }

    #[test]
    fn a_renderer_round_trips_through_the_c_abi() {
        let r = sd_new();
        // SAFETY: `r` is live until `sd_free`; every buffer is sized as passed.
        unsafe {
            assert_eq!(sd_render_live(r, std::ptr::null(), 0, 0.0), SD_ERR_INPUT);
            assert_eq!(last_error(r), "no scene set");
            assert_eq!(sd_set_scene(r, SCENE.as_ptr(), SCENE.len()), 0);
            assert_eq!((sd_width(r), sd_height(r)), (4, 2));
            assert_eq!(sd_render_still(r, std::ptr::null(), 0, std::ptr::null(), 0, 0.0), 0);
            assert!(!sd_pixels(r).is_null());

            let mut bgra = [0u8; 32];
            assert_eq!(sd_copy_bgra(r, bgra.as_mut_ptr(), 31), SD_ERR_BUFFER);
            assert_eq!(sd_copy_bgra(r, bgra.as_mut_ptr(), bgra.len()), 32);
            // The canvas is #08080A: B first.
            assert_eq!(&bgra[..4], &[0x0A, 0x08, 0x08, 0xFF]);

            let bad = b"{";
            assert_eq!(sd_set_scene(r, bad.as_ptr(), bad.len()), SD_ERR_INPUT);
            assert!(last_error(r).starts_with("scene is not valid JSON"));
            assert_eq!(sd_set_scene(r, std::ptr::null(), 5), SD_ERR_POINTER);

            assert_eq!(sd_set_multi_dial(r, std::ptr::null(), 0), 0, "no dial");
            assert_eq!(sd_set_multi_dial(r, bad.as_ptr(), bad.len()), SD_ERR_INPUT);
            assert!(last_error(r).starts_with("multi-dial is not a valid dial reading"));
            sd_free(r);
        }
    }

    #[test]
    fn null_renderers_and_pointers_are_errors_not_crashes() {
        // SAFETY: null is an accepted renderer argument everywhere.
        unsafe {
            assert_eq!(sd_set_scene(std::ptr::null_mut(), SCENE.as_ptr(), SCENE.len()), SD_ERR_NULL);
            assert!(sd_pixels(std::ptr::null()).is_null());
            assert_eq!(sd_width(std::ptr::null()), 0);
            assert_eq!(sd_last_error(std::ptr::null(), std::ptr::null_mut(), 0), 0);
            sd_free(std::ptr::null_mut());
        }
    }

    #[test]
    fn a_panic_becomes_an_error_code_with_its_message() {
        let r = sd_new();
        let code = with_renderer(r, |_| panic!("boom"));
        assert_eq!(code, SD_ERR_PANIC);
        assert_eq!(last_error(r), "renderer panicked: boom");
        // SAFETY: `r` came from `sd_new`.
        unsafe { sd_free(r) };
    }

    #[test]
    fn alloc_and_dealloc_pair_up() {
        let p = sd_alloc(16);
        assert!(!p.is_null());
        // SAFETY: `p` holds 16 bytes from `sd_alloc(16)`.
        unsafe {
            p.write_bytes(7, 16);
            sd_dealloc(p, 16);
        }
        assert!(sd_alloc(0).is_null());
    }
}
