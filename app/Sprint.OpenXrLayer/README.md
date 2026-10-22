# Sprint OpenXR layer

An implicit OpenXR API layer that draws the driving guide (reference line and brake boards) into
the headset view. Why it exists and the world-to-eye maths: `docs/internals/driving-guide.md`.
The shared-memory contract is `src/guide_feed_layout.h`; its C# twin must match byte for byte.

## Build

- Windows x64: `make build-xr-layer` (CMake + MSVC). It builds `build/Release/` and copies
  `XR_APILAYER_SPRINT_driving_guide.dll` and `XR_APILAYER_SPRINT_driving_guide.json` into
  `app/desktop/resources/openxr-layer/`, which `app/desktop/scripts/package.mjs` ships unpacked as
  `resources/openxr-layer/` in the packaged app. The release workflow runs the same task.
- The portable core (`src/guide_math.*`) and its test build anywhere:
  `cmake -S app/Sprint.OpenXrLayer -B app/Sprint.OpenXrLayer/build && cmake --build app/Sprint.OpenXrLayer/build && ctest --test-dir app/Sprint.OpenXrLayer/build`.
  The DLL target only exists on Windows; the OpenXR headers come from FetchContent there.
- The DLL links the MSVC runtime statically, since it loads inside the game's process.

## Registration

The DLL never touches the registry. The Sprint host writes the manifest's absolute path as a
DWORD 0 value under `HKCU\Software\Khronos\OpenXR\1\ApiLayers\Implicit` when VR is on, and
deletes it when VR is off. The manifest's `library_path` is relative, so the DLL must stay next to
it. Setting `SPRINT_XR_LAYER_DISABLE` (any value) in the game's environment makes the loader skip
the layer.

## Logs

`%LOCALAPPDATA%\Sprint\openxr-layer.log`, restarted once it passes 1 MB. One line per event: load
and version, the application name, the graphics API, the swapchain format, feed connect and
disconnect, the first submitted frame, and whatever sent a session to passthrough. Nothing per
frame.

## Behaviour worth knowing

- Every call reaches the game's runtime. The layer adds its projection layer only when the feed
  asks for VR and has a fresh pose and a lap; any failure stops it for the rest of the session.
- D3D11 sessions draw on the game's immediate context inside a swapped `ID3DDeviceContextState`,
  so the game's pipeline state is untouched. D3D12 sessions draw through D3D11On12 on the game's
  queue.
- Colours are linear with premultiplied alpha; the layer is submitted with
  `XR_COMPOSITION_LAYER_BLEND_TEXTURE_SOURCE_ALPHA_BIT` and without the unpremultiplied bit.
