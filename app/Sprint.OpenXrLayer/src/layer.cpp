// The OpenXR API layer: loader negotiation, the instance and session hooks, and the per-frame
// guide layer appended after the game's own layers. See docs/internals/driving-guide.md.
//
// Rule for every hook: the game's call always goes through. Anything we cannot do (no feed,
// nothing to draw, an unsupported session, an internal failure) leaves the frame untouched, and a
// failure stops us for the rest of the session. No exception crosses back into the loader.
#include "renderer_d3d11.h"  // windows.h, d3d11 and d3d12 first: openxr_platform.h needs them

#include <openxr/openxr.h>
#include <openxr/openxr_platform.h>
#include <openxr/openxr_loader_negotiation.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <cstring>
#include <exception>
#include <memory>
#include <mutex>
#include <vector>

#include "guide_feed.h"
#include "guide_math.h"
#include "layer_log.h"

namespace {

using sprint::xr::GraphicsApi;
using sprint::xr::GuideFeed;
using sprint::xr::GuideRenderer;
using sprint::xr::Log;
namespace guide = sprint::guide;

constexpr const char* kLayerName = SPRINT_XR_LAYER_NAME;
constexpr size_t kMaxViews = 4;
constexpr size_t kMaxSubmittedLayers = 64;
constexpr double kStalePoseSeconds = 0.5;  // older than this, the host has stopped writing
constexpr float kNearZ = 0.05f;
constexpr float kFarZ = 2000.f;
constexpr int32_t kMaxImageSide = 16384;

// The next layer's (or the runtime's) functions for one instance. Immutable once published, and
// never freed, so a hook that loaded the pointer can always use it.
struct NextFunctions {
  bool hooked = false;  // every function below resolved; otherwise we forward everything
  PFN_xrGetInstanceProcAddr getInstanceProcAddr = nullptr;
  PFN_xrDestroyInstance destroyInstance = nullptr;
  PFN_xrCreateSession createSession = nullptr;
  PFN_xrDestroySession destroySession = nullptr;
  PFN_xrBeginFrame beginFrame = nullptr;
  PFN_xrEndFrame endFrame = nullptr;
  PFN_xrGetSystemProperties getSystemProperties = nullptr;
  PFN_xrEnumerateSwapchainFormats enumerateSwapchainFormats = nullptr;
  PFN_xrCreateSwapchain createSwapchain = nullptr;
  PFN_xrDestroySwapchain destroySwapchain = nullptr;
  PFN_xrEnumerateSwapchainImages enumerateSwapchainImages = nullptr;
  PFN_xrAcquireSwapchainImage acquireSwapchainImage = nullptr;
  PFN_xrWaitSwapchainImage waitSwapchainImage = nullptr;
  PFN_xrReleaseSwapchainImage releaseSwapchainImage = nullptr;
};

std::atomic<const NextFunctions*> g_next{nullptr};
std::atomic<int64_t> g_beginFrameQpc{0};
// Set when a hook caught an exception; checked before the session state is touched again.
std::atomic<bool> g_sessionBroken{false};

struct EyeSwapchain {
  XrSwapchain handle = XR_NULL_HANDLE;
  int32_t width = 0;
  int32_t height = 0;
};

// Everything tied to the game's one session. The renderer is created on the first frame that has
// something to draw, so a game whose user never turns the guide on gets no extra device objects.
struct SessionState {
  XrSession handle = XR_NULL_HANDLE;
  bool failed = false;
  bool loggedFirstFrame = false;
  uint32_t maxLayerCount = 0;
  DXGI_FORMAT format = DXGI_FORMAT_UNKNOWN;
  Microsoft::WRL::ComPtr<ID3D11Device> d3d11Device;
  Microsoft::WRL::ComPtr<ID3D12Device> d3d12Device;
  Microsoft::WRL::ComPtr<ID3D12CommandQueue> d3d12Queue;
  std::unique_ptr<GuideRenderer> renderer;
  std::vector<EyeSwapchain> eyes;
};

struct LayerState {
  std::mutex mutex;
  XrInstance instance = XR_NULL_HANDLE;
  SessionState session;
  GuideFeed feed;
  guide::GuideSnapshot snapshot;
  std::vector<guide::Vertex> vertices;
};

// Leaked on purpose: nothing D3D or OpenXR may run from static destructors at DLL unload.
LayerState& State() {
  static LayerState* state = new LayerState();
  return *state;
}

void FailSession(SessionState& session, const char* reason) {
  if (session.failed) return;
  session.failed = true;
  Log("passthrough for the rest of the session: %s", reason);
}

void BreakSessionAfterException(const char* where) noexcept {
  if (!g_sessionBroken.exchange(true)) Log("passthrough for the rest of the session: exception in %s", where);
}

template <typename T>
bool Resolve(PFN_xrGetInstanceProcAddr getInstanceProcAddr, XrInstance instance, const char* name, T& out) {
  PFN_xrVoidFunction function = nullptr;
  if (XR_FAILED(getInstanceProcAddr(instance, name, &function)) || function == nullptr) return false;
  out = reinterpret_cast<T>(function);
  return true;
}

bool ResolveAll(XrInstance instance, NextFunctions& next) {
  const PFN_xrGetInstanceProcAddr gipa = next.getInstanceProcAddr;
  return Resolve(gipa, instance, "xrDestroyInstance", next.destroyInstance) &&
         Resolve(gipa, instance, "xrCreateSession", next.createSession) &&
         Resolve(gipa, instance, "xrDestroySession", next.destroySession) &&
         Resolve(gipa, instance, "xrBeginFrame", next.beginFrame) &&
         Resolve(gipa, instance, "xrEndFrame", next.endFrame) &&
         Resolve(gipa, instance, "xrGetSystemProperties", next.getSystemProperties) &&
         Resolve(gipa, instance, "xrEnumerateSwapchainFormats", next.enumerateSwapchainFormats) &&
         Resolve(gipa, instance, "xrCreateSwapchain", next.createSwapchain) &&
         Resolve(gipa, instance, "xrDestroySwapchain", next.destroySwapchain) &&
         Resolve(gipa, instance, "xrEnumerateSwapchainImages", next.enumerateSwapchainImages) &&
         Resolve(gipa, instance, "xrAcquireSwapchainImage", next.acquireSwapchainImage) &&
         Resolve(gipa, instance, "xrWaitSwapchainImage", next.waitSwapchainImage) &&
         Resolve(gipa, instance, "xrReleaseSwapchainImage", next.releaseSwapchainImage);
}

const char* FormatName(DXGI_FORMAT format) {
  switch (format) {
    case DXGI_FORMAT_R8G8B8A8_UNORM_SRGB:
      return "R8G8B8A8_UNORM_SRGB";
    case DXGI_FORMAT_B8G8R8A8_UNORM_SRGB:
      return "B8G8R8A8_UNORM_SRGB";
    case DXGI_FORMAT_R8G8B8A8_UNORM:
      return "R8G8B8A8_UNORM";
    case DXGI_FORMAT_B8G8R8A8_UNORM:
      return "B8G8R8A8_UNORM";
    default:
      return "other";
  }
}

// 8-bit with alpha, sRGB first. The mesh carries linear colour either way: an _SRGB target encodes
// it on write, and runtimes read a UNORM image as linear.
DXGI_FORMAT ChooseFormat(const std::vector<int64_t>& offered) {
  constexpr DXGI_FORMAT kPreferred[] = {DXGI_FORMAT_R8G8B8A8_UNORM_SRGB, DXGI_FORMAT_B8G8R8A8_UNORM_SRGB,
                                        DXGI_FORMAT_R8G8B8A8_UNORM, DXGI_FORMAT_B8G8R8A8_UNORM};
  for (const DXGI_FORMAT preferred : kPreferred) {
    for (const int64_t format : offered) {
      if (format == static_cast<int64_t>(preferred)) return preferred;
    }
  }
  return DXGI_FORMAT_UNKNOWN;
}

void DestroyEye(SessionState& session, const NextFunctions& next, size_t eye) {
  if (session.renderer) session.renderer->ResetEye(eye);
  EyeSwapchain& swapchain = session.eyes[eye];
  if (swapchain.handle != XR_NULL_HANDLE) next.destroySwapchain(swapchain.handle);
  swapchain = EyeSwapchain{};
}

// Drops our swapchains (views and wrappers first), the renderer and the game's device references.
void ReleaseSession(LayerState& state, const NextFunctions& next) {
  SessionState& session = state.session;
  for (size_t eye = 0; eye < session.eyes.size(); ++eye) DestroyEye(session, next, eye);
  session.renderer.reset();  // before the device references it was built on
  session = SessionState{};
}

void OnSessionCreated(LayerState& state, const NextFunctions& next, XrInstance instance,
                      const XrSessionCreateInfo& createInfo, XrSession handle) {
  ReleaseSession(state, next);  // a previous session the game never destroyed
  g_sessionBroken.store(false);
  SessionState& session = state.session;
  session.handle = handle;

  for (auto* entry = static_cast<const XrBaseInStructure*>(createInfo.next); entry != nullptr; entry = entry->next) {
    if (entry->type == XR_TYPE_GRAPHICS_BINDING_D3D11_KHR) {
      session.d3d11Device = reinterpret_cast<const XrGraphicsBindingD3D11KHR*>(entry)->device;
      Log("session: D3D11 graphics binding");
      break;
    }
    if (entry->type == XR_TYPE_GRAPHICS_BINDING_D3D12_KHR) {
      const auto* binding = reinterpret_cast<const XrGraphicsBindingD3D12KHR*>(entry);
      session.d3d12Device = binding->device;
      session.d3d12Queue = binding->queue;
      Log("session: D3D12 graphics binding");
      break;
    }
  }
  if (!session.d3d11Device && !(session.d3d12Device && session.d3d12Queue)) {
    FailSession(session, "the graphics binding is neither D3D11 nor D3D12");
    return;
  }

  XrSystemProperties properties{XR_TYPE_SYSTEM_PROPERTIES};
  if (XR_FAILED(next.getSystemProperties(instance, createInfo.systemId, &properties))) {
    FailSession(session, "xrGetSystemProperties failed");
    return;
  }
  session.maxLayerCount = properties.graphicsProperties.maxLayerCount;

  uint32_t count = 0;
  std::vector<int64_t> formats;
  if (XR_SUCCEEDED(next.enumerateSwapchainFormats(handle, 0, &count, nullptr)) && count > 0) {
    formats.resize(count);
    if (XR_FAILED(next.enumerateSwapchainFormats(handle, count, &count, formats.data()))) formats.clear();
    formats.resize(std::min<size_t>(formats.size(), count));
  }
  session.format = ChooseFormat(formats);
  if (session.format == DXGI_FORMAT_UNKNOWN) {
    FailSession(session, "the runtime offers no 8-bit RGBA or BGRA swapchain format");
    return;
  }
  Log("session: swapchain format %s, max %u layers", FormatName(session.format), session.maxLayerCount);
}

bool EnsureRenderer(SessionState& session) {
  if (session.renderer) return true;
  session.renderer = session.d3d11Device
                         ? GuideRenderer::CreateForD3D11(session.d3d11Device.Get())
                         : GuideRenderer::CreateForD3D12(session.d3d12Device.Get(), session.d3d12Queue.Get());
  if (!session.renderer) {
    FailSession(session, "the renderer could not be created");
    return false;
  }
  return true;
}

bool CreateEye(SessionState& session, const NextFunctions& next, size_t eye, int32_t width, int32_t height) {
  EyeSwapchain& swapchain = session.eyes[eye];
  XrSwapchainCreateInfo createInfo{XR_TYPE_SWAPCHAIN_CREATE_INFO};
  createInfo.usageFlags = XR_SWAPCHAIN_USAGE_COLOR_ATTACHMENT_BIT;
  createInfo.format = static_cast<int64_t>(session.format);
  createInfo.sampleCount = 1;
  createInfo.width = static_cast<uint32_t>(width);
  createInfo.height = static_cast<uint32_t>(height);
  createInfo.faceCount = 1;
  createInfo.arraySize = 1;
  createInfo.mipCount = 1;
  XrResult result = next.createSwapchain(session.handle, &createInfo, &swapchain.handle);
  if (XR_FAILED(result)) {
    swapchain.handle = XR_NULL_HANDLE;
    Log("xrCreateSwapchain %dx%d failed (%d)", width, height, static_cast<int>(result));
    return false;
  }
  swapchain.width = width;
  swapchain.height = height;

  uint32_t count = 0;
  result = next.enumerateSwapchainImages(swapchain.handle, 0, &count, nullptr);
  if (XR_FAILED(result) || count == 0) return false;
  bool bound = false;
  if (session.renderer->Api() == GraphicsApi::D3D11) {
    std::vector<XrSwapchainImageD3D11KHR> images(count, {XR_TYPE_SWAPCHAIN_IMAGE_D3D11_KHR});
    result = next.enumerateSwapchainImages(swapchain.handle, count, &count,
                                           reinterpret_cast<XrSwapchainImageBaseHeader*>(images.data()));
    if (XR_FAILED(result)) return false;
    std::vector<ID3D11Texture2D*> textures;
    for (uint32_t i = 0; i < count; ++i) textures.push_back(images[i].texture);
    bound = session.renderer->SetEyeImagesD3D11(eye, textures, session.format, createInfo.width, createInfo.height);
  } else {
    std::vector<XrSwapchainImageD3D12KHR> images(count, {XR_TYPE_SWAPCHAIN_IMAGE_D3D12_KHR});
    result = next.enumerateSwapchainImages(swapchain.handle, count, &count,
                                           reinterpret_cast<XrSwapchainImageBaseHeader*>(images.data()));
    if (XR_FAILED(result)) return false;
    std::vector<ID3D12Resource*> textures;
    for (uint32_t i = 0; i < count; ++i) textures.push_back(images[i].texture);
    bound = session.renderer->SetEyeImagesD3D12(eye, textures, session.format, createInfo.width, createInfo.height);
  }
  if (bound) Log("swapchain for view %zu: %dx%d, %u images", eye, width, height, count);
  return bound;
}

// One swapchain per view, sized to the game's sub-image for that view; recreated when it changes.
bool EnsureSwapchains(SessionState& session, const NextFunctions& next, const XrCompositionLayerProjection& game) {
  if (session.eyes.size() < game.viewCount) session.eyes.resize(game.viewCount);
  for (uint32_t view = 0; view < game.viewCount; ++view) {
    const XrExtent2Di extent = game.views[view].subImage.imageRect.extent;
    if (extent.width <= 0 || extent.height <= 0 || extent.width > kMaxImageSide || extent.height > kMaxImageSide) {
      return false;  // odd frame; skip it without giving up on the session
    }
    const EyeSwapchain& swapchain = session.eyes[view];
    if (swapchain.handle != XR_NULL_HANDLE && swapchain.width == extent.width && swapchain.height == extent.height) {
      continue;
    }
    DestroyEye(session, next, view);
    if (!CreateEye(session, next, view, extent.width, extent.height)) {
      DestroyEye(session, next, view);
      FailSession(session, "our swapchain could not be created");
      return false;
    }
  }
  return true;
}

// Calls GuideRenderer::EndFrame on scope exit, so the game's D3D11 state always comes back.
class RendererFrame {
 public:
  explicit RendererFrame(GuideRenderer& renderer) : renderer_(renderer) {}
  RendererFrame(const RendererFrame&) = delete;
  RendererFrame& operator=(const RendererFrame&) = delete;
  ~RendererFrame() { renderer_.EndFrame(); }

 private:
  GuideRenderer& renderer_;
};

// Renders this frame's guide and fills `layer` (views in `views`). False leaves the frame alone.
bool PrepareGuideLayer(LayerState& state, const NextFunctions& next, XrSession handle, const XrFrameEndInfo& info,
                       XrCompositionLayerProjection& layer, std::array<XrCompositionLayerProjectionView, kMaxViews>& views) {
  SessionState& session = state.session;
  if (session.handle != handle || session.failed) return false;
  if (info.layerCount + 1 > session.maxLayerCount || info.layerCount + 1 > kMaxSubmittedLayers) return false;
  if (info.layerCount > 0 && info.layers == nullptr) return false;

  const XrCompositionLayerProjection* game = nullptr;
  for (uint32_t i = 0; i < info.layerCount; ++i) {
    const XrCompositionLayerBaseHeader* candidate = info.layers[i];
    if (candidate != nullptr && candidate->type == XR_TYPE_COMPOSITION_LAYER_PROJECTION) {
      game = reinterpret_cast<const XrCompositionLayerProjection*>(candidate);
      break;
    }
  }
  if (game == nullptr || game->views == nullptr || game->viewCount == 0 || game->viewCount > kMaxViews) return false;

  if (!state.feed.Read(state.snapshot) || !guide::ShouldDraw(state.snapshot)) return false;
  const guide::GuideSnapshot& snapshot = state.snapshot;
  if (snapshot.qpcFrequency <= 0) return false;
  // Extrapolate to xrBeginFrame: about when the game sampled its own physics for this frame.
  const double age = static_cast<double>(g_beginFrameQpc.load() - snapshot.sampleQpc) /
                     static_cast<double>(snapshot.qpcFrequency);
  if (age > kStalePoseSeconds) return false;
  guide::BuildGuideMesh(snapshot, guide::ExtrapolatePose(snapshot.pose, age), state.vertices);
  if (state.vertices.empty()) return false;

  if (!EnsureRenderer(session) || !EnsureSwapchains(session, next, *game)) return false;

  const uint32_t viewCount = game->viewCount;
  std::array<uint32_t, kMaxViews> imageIndex{};
  uint32_t waited = 0;
  bool ok = true;
  for (uint32_t view = 0; view < viewCount && ok; ++view) {
    const XrSwapchain swapchain = session.eyes[view].handle;
    XrSwapchainImageAcquireInfo acquireInfo{XR_TYPE_SWAPCHAIN_IMAGE_ACQUIRE_INFO};
    if (XR_FAILED(next.acquireSwapchainImage(swapchain, &acquireInfo, &imageIndex[view]))) {
      ok = false;
      break;
    }
    XrSwapchainImageWaitInfo waitInfo{XR_TYPE_SWAPCHAIN_IMAGE_WAIT_INFO};
    waitInfo.timeout = XR_INFINITE_DURATION;
    // An acquired image that was never waited on cannot be released; the session is lost to us then.
    if (next.waitSwapchainImage(swapchain, &waitInfo) != XR_SUCCESS) {
      ok = false;
      break;
    }
    waited = view + 1;
  }

  if (ok) {
    RendererFrame frame(*session.renderer);
    ok = session.renderer->BeginFrame(state.vertices);
    for (uint32_t view = 0; view < viewCount && ok; ++view) {
      const XrCompositionLayerProjectionView& source = game->views[view];
      const guide::Quat orientation{source.pose.orientation.x, source.pose.orientation.y, source.pose.orientation.z,
                                    source.pose.orientation.w};
      const guide::Vec3 position{source.pose.position.x, source.pose.position.y, source.pose.position.z};
      const guide::Fov fov{source.fov.angleLeft, source.fov.angleRight, source.fov.angleUp, source.fov.angleDown};
      ok = session.renderer->DrawEye(view, imageIndex[view], guide::ViewProjection(orientation, position, fov, kNearZ, kFarZ));
    }
  }  // EndFrame: the work is submitted before the images go back to the runtime

  for (uint32_t view = 0; view < waited; ++view) {
    XrSwapchainImageReleaseInfo releaseInfo{XR_TYPE_SWAPCHAIN_IMAGE_RELEASE_INFO};
    if (XR_FAILED(next.releaseSwapchainImage(session.eyes[view].handle, &releaseInfo))) ok = false;
  }
  if (!ok) {
    FailSession(session, "drawing into our swapchain failed");
    return false;
  }

  layer = XrCompositionLayerProjection{XR_TYPE_COMPOSITION_LAYER_PROJECTION};
  // Premultiplied alpha, matching the pixel shader; no UNPREMULTIPLIED bit.
  layer.layerFlags = XR_COMPOSITION_LAYER_BLEND_TEXTURE_SOURCE_ALPHA_BIT;
  layer.space = game->space;
  layer.viewCount = viewCount;
  layer.views = views.data();
  for (uint32_t view = 0; view < viewCount; ++view) {
    XrCompositionLayerProjectionView& target = views[view];
    target = XrCompositionLayerProjectionView{XR_TYPE_COMPOSITION_LAYER_PROJECTION_VIEW};
    target.pose = game->views[view].pose;
    target.fov = game->views[view].fov;
    target.subImage.swapchain = session.eyes[view].handle;
    target.subImage.imageRect.offset = {0, 0};
    target.subImage.imageRect.extent = {session.eyes[view].width, session.eyes[view].height};
    target.subImage.imageArrayIndex = 0;
  }
  if (!session.loggedFirstFrame) {
    session.loggedFirstFrame = true;
    Log("first guide frame submitted (%u views, %u vertices)", viewCount, static_cast<unsigned>(state.vertices.size()));
  }
  return true;
}

// Hooks, handed to the loader through LayerGetInstanceProcAddr.

XRAPI_ATTR XrResult XRAPI_CALL HookDestroyInstance(XrInstance instance) {
  const NextFunctions* next = g_next.load();
  try {
    LayerState& state = State();
    std::lock_guard<std::mutex> lock(state.mutex);
    if (instance == state.instance) {
      ReleaseSession(state, *next);
      state.instance = XR_NULL_HANDLE;
    }
  } catch (...) {
    BreakSessionAfterException("xrDestroyInstance");
  }
  return next->destroyInstance(instance);
}

XRAPI_ATTR XrResult XRAPI_CALL HookCreateSession(XrInstance instance, const XrSessionCreateInfo* createInfo,
                                                 XrSession* session) {
  const NextFunctions* next = g_next.load();
  const XrResult result = next->createSession(instance, createInfo, session);
  if (XR_FAILED(result) || createInfo == nullptr || session == nullptr) return result;
  try {
    LayerState& state = State();
    std::lock_guard<std::mutex> lock(state.mutex);
    OnSessionCreated(state, *next, instance, *createInfo, *session);
  } catch (...) {
    BreakSessionAfterException("xrCreateSession");
  }
  return result;
}

XRAPI_ATTR XrResult XRAPI_CALL HookDestroySession(XrSession session) {
  const NextFunctions* next = g_next.load();
  try {
    LayerState& state = State();
    std::lock_guard<std::mutex> lock(state.mutex);
    if (session == state.session.handle) {
      ReleaseSession(state, *next);
      Log("session: destroyed");
    }
  } catch (...) {
    BreakSessionAfterException("xrDestroySession");
  }
  return next->destroySession(session);
}

XRAPI_ATTR XrResult XRAPI_CALL HookBeginFrame(XrSession session, const XrFrameBeginInfo* frameBeginInfo) {
  LARGE_INTEGER now;
  QueryPerformanceCounter(&now);
  g_beginFrameQpc.store(now.QuadPart);
  return g_next.load()->beginFrame(session, frameBeginInfo);
}

XRAPI_ATTR XrResult XRAPI_CALL HookEndFrame(XrSession session, const XrFrameEndInfo* frameEndInfo) {
  const NextFunctions* next = g_next.load();
  XrCompositionLayerProjection guideLayer{XR_TYPE_COMPOSITION_LAYER_PROJECTION};
  std::array<XrCompositionLayerProjectionView, kMaxViews> guideViews{};
  bool add = false;
  if (frameEndInfo != nullptr && !g_sessionBroken.load()) {
    try {
      LayerState& state = State();
      std::lock_guard<std::mutex> lock(state.mutex);
      add = PrepareGuideLayer(state, *next, session, *frameEndInfo, guideLayer, guideViews);
    } catch (...) {
      BreakSessionAfterException("xrEndFrame");
      add = false;
    }
  }
  if (!add) return next->endFrame(session, frameEndInfo);

  // The game's layers in their order, then ours on top.
  std::array<const XrCompositionLayerBaseHeader*, kMaxSubmittedLayers> layers{};
  for (uint32_t i = 0; i < frameEndInfo->layerCount; ++i) layers[i] = frameEndInfo->layers[i];
  layers[frameEndInfo->layerCount] = reinterpret_cast<const XrCompositionLayerBaseHeader*>(&guideLayer);
  XrFrameEndInfo patched = *frameEndInfo;
  patched.layerCount = frameEndInfo->layerCount + 1;
  patched.layers = layers.data();
  return next->endFrame(session, &patched);
}

XRAPI_ATTR XrResult XRAPI_CALL LayerGetInstanceProcAddr(XrInstance instance, const char* name,
                                                        PFN_xrVoidFunction* function) {
  if (name == nullptr || function == nullptr) return XR_ERROR_VALIDATION_FAILURE;
  const NextFunctions* next = g_next.load();
  if (next == nullptr) {
    *function = nullptr;
    return XR_ERROR_HANDLE_INVALID;
  }
  if (next->hooked) {
    struct Hook {
      const char* name;
      PFN_xrVoidFunction function;
    };
    static const Hook kHooks[] = {
        {"xrGetInstanceProcAddr", reinterpret_cast<PFN_xrVoidFunction>(&LayerGetInstanceProcAddr)},
        {"xrDestroyInstance", reinterpret_cast<PFN_xrVoidFunction>(&HookDestroyInstance)},
        {"xrCreateSession", reinterpret_cast<PFN_xrVoidFunction>(&HookCreateSession)},
        {"xrDestroySession", reinterpret_cast<PFN_xrVoidFunction>(&HookDestroySession)},
        {"xrBeginFrame", reinterpret_cast<PFN_xrVoidFunction>(&HookBeginFrame)},
        {"xrEndFrame", reinterpret_cast<PFN_xrVoidFunction>(&HookEndFrame)},
    };
    for (const Hook& hook : kHooks) {
      if (std::strcmp(name, hook.name) == 0) {
        *function = hook.function;
        return XR_SUCCESS;
      }
    }
  }
  return next->getInstanceProcAddr(instance, name, function);
}

XRAPI_ATTR XrResult XRAPI_CALL LayerCreateApiLayerInstance(const XrInstanceCreateInfo* info,
                                                           const XrApiLayerCreateInfo* apiLayerInfo,
                                                           XrInstance* instance) {
  if (apiLayerInfo == nullptr || apiLayerInfo->structType != XR_LOADER_INTERFACE_STRUCT_API_LAYER_CREATE_INFO ||
      apiLayerInfo->structVersion != XR_API_LAYER_CREATE_INFO_STRUCT_VERSION ||
      apiLayerInfo->structSize != sizeof(XrApiLayerCreateInfo) || apiLayerInfo->nextInfo == nullptr) {
    Log("xrCreateApiLayerInstance: unexpected loader create info");
    return XR_ERROR_INITIALIZATION_FAILED;
  }
  const XrApiLayerNextInfo* nextInfo = apiLayerInfo->nextInfo;
  if (nextInfo->structType != XR_LOADER_INTERFACE_STRUCT_API_LAYER_NEXT_INFO ||
      nextInfo->structVersion != XR_API_LAYER_NEXT_INFO_STRUCT_VERSION ||
      nextInfo->structSize != sizeof(XrApiLayerNextInfo) || std::strcmp(nextInfo->layerName, kLayerName) != 0 ||
      nextInfo->nextGetInstanceProcAddr == nullptr || nextInfo->nextCreateApiLayerInstance == nullptr) {
    Log("xrCreateApiLayerInstance: unexpected next layer info");
    return XR_ERROR_INITIALIZATION_FAILED;
  }

  // The layers below us see the chain without our entry.
  XrApiLayerCreateInfo chained = *apiLayerInfo;
  chained.nextInfo = nextInfo->next;
  const XrResult result = nextInfo->nextCreateApiLayerInstance(info, &chained, instance);
  if (XR_FAILED(result) || instance == nullptr) return result;

  try {
    auto* next = new NextFunctions();
    next->getInstanceProcAddr = nextInfo->nextGetInstanceProcAddr;
    next->hooked = ResolveAll(*instance, *next);
    g_next.store(next);  // the previous table, if any, stays allocated for hooks still running

    LayerState& state = State();
    std::lock_guard<std::mutex> lock(state.mutex);
    state.instance = *instance;
    const char* application = info != nullptr ? info->applicationInfo.applicationName : "?";
    const char* engine = info != nullptr ? info->applicationInfo.engineName : "?";
    Log("instance created for \"%s\" (engine \"%s\")%s", application, engine,
        next->hooked ? "" : "; next layer is missing functions, passing everything through");
  } catch (...) {
    // Without a published table we cannot forward; one that is published but unhooked is fine.
    if (g_next.load() == nullptr) {
      Log("xrCreateApiLayerInstance: setup failed before the next layer was recorded");
    }
  }
  return result;
}

}  // namespace

// The one export the loader looks for (the manifest names no other function).
extern "C" __declspec(dllexport) XrResult XRAPI_CALL xrNegotiateLoaderApiLayerInterface(
    const XrNegotiateLoaderInfo* loaderInfo, const char* layerName, XrNegotiateApiLayerRequest* apiLayerRequest) {
  if (loaderInfo == nullptr || layerName == nullptr || apiLayerRequest == nullptr ||
      std::strcmp(layerName, kLayerName) != 0 || loaderInfo->structType != XR_LOADER_INTERFACE_STRUCT_LOADER_INFO ||
      loaderInfo->structVersion != XR_LOADER_INFO_STRUCT_VERSION ||
      loaderInfo->structSize != sizeof(XrNegotiateLoaderInfo) ||
      apiLayerRequest->structType != XR_LOADER_INTERFACE_STRUCT_API_LAYER_REQUEST ||
      apiLayerRequest->structVersion != XR_API_LAYER_INFO_STRUCT_VERSION ||
      apiLayerRequest->structSize != sizeof(XrNegotiateApiLayerRequest)) {
    return XR_ERROR_INITIALIZATION_FAILED;
  }
  if (loaderInfo->minInterfaceVersion > XR_CURRENT_LOADER_API_LAYER_VERSION ||
      loaderInfo->maxInterfaceVersion < XR_CURRENT_LOADER_API_LAYER_VERSION) {
    return XR_ERROR_INITIALIZATION_FAILED;
  }
  // The manifest declares API 1.0; any loader that accepts some 1.x version accepts us.
  const XrVersion apiVersion = XR_MAKE_VERSION(1, 0, 0);
  if (loaderInfo->minApiVersion > apiVersion || XR_VERSION_MAJOR(loaderInfo->maxApiVersion) < 1) {
    return XR_ERROR_INITIALIZATION_FAILED;
  }

  apiLayerRequest->layerInterfaceVersion = XR_CURRENT_LOADER_API_LAYER_VERSION;
  apiLayerRequest->layerApiVersion = apiVersion;
  apiLayerRequest->getInstanceProcAddr = LayerGetInstanceProcAddr;
  apiLayerRequest->createApiLayerInstance = LayerCreateApiLayerInstance;
  Log("%s %s loaded", kLayerName, SPRINT_XR_LAYER_VERSION);
  return XR_SUCCESS;
}
