#include "renderer_d3d11.h"

#include <d3dcompiler.h>

#include <algorithm>
#include <cstring>
#include <iterator>

#include "layer_log.h"

using Microsoft::WRL::ComPtr;

namespace sprint::xr {
namespace {

static_assert(sizeof(guide::Vertex) == 28, "the input layout below assumes float3 + float4");
static_assert(sizeof(guide::Mat4) == 64, "the constant buffer holds one float4x4");

constexpr char kShaderSource[] = R"(
cbuffer Frame : register(b0) { row_major float4x4 viewProjection; };
struct VsIn { float3 position : POSITION; float4 color : COLOR; };
struct VsOut { float4 position : SV_Position; float4 color : COLOR; };
VsOut VsMain(VsIn input) {
  VsOut output;
  output.position = mul(viewProjection, float4(input.position, 1.0));
  output.color = input.color;
  return output;
}
// Premultiplied output: the layer is submitted without XR_COMPOSITION_LAYER_UNPREMULTIPLIED_ALPHA_BIT.
float4 PsMain(VsOut input) : SV_Target { return float4(input.color.rgb * input.color.a, input.color.a); }
)";

constexpr UINT kSampleCount = 4;

using D3DCompileFn = decltype(&D3DCompile);

// Loaded at runtime rather than linked, so a machine without it passes through instead of failing
// to load the layer at all.
D3DCompileFn LoadCompiler() {
  static const HMODULE module = LoadLibraryW(L"d3dcompiler_47.dll");
  if (module == nullptr) return nullptr;
  return reinterpret_cast<D3DCompileFn>(GetProcAddress(module, "D3DCompile"));
}

ComPtr<ID3DBlob> Compile(D3DCompileFn compile, const char* entry, const char* target) {
  ComPtr<ID3DBlob> code;
  ComPtr<ID3DBlob> errors;
  const HRESULT hr = compile(kShaderSource, sizeof(kShaderSource) - 1, "sprint_guide", nullptr, nullptr, entry, target,
                             D3DCOMPILE_OPTIMIZATION_LEVEL3, 0, &code, &errors);
  if (FAILED(hr)) {
    Log("renderer: %s did not compile (0x%08lX): %s", entry, hr,
        errors ? static_cast<const char*>(errors->GetBufferPointer()) : "no message");
    return nullptr;
  }
  return code;
}

}  // namespace

std::unique_ptr<GuideRenderer> GuideRenderer::CreateForD3D11(ID3D11Device* device) {
  if (device == nullptr) return nullptr;
  std::unique_ptr<GuideRenderer> renderer(new GuideRenderer());
  renderer->api_ = GraphicsApi::D3D11;
  renderer->device_ = device;
  device->GetImmediateContext(&renderer->context_);

  const D3D_FEATURE_LEVEL level = device->GetFeatureLevel();
  if (level < D3D_FEATURE_LEVEL_10_0) {
    Log("renderer: D3D11 feature level 0x%X is below 10_0", static_cast<unsigned>(level));
    return nullptr;
  }
  ComPtr<ID3D11Device1> device1;
  HRESULT hr = device->QueryInterface(IID_PPV_ARGS(&device1));
  if (SUCCEEDED(hr)) hr = renderer->context_.As(&renderer->context1_);
  if (FAILED(hr)) {
    Log("renderer: ID3D11Device1 unavailable (0x%08lX)", hr);
    return nullptr;
  }
  // Our own context state, so drawing on the game's immediate context leaves its state untouched.
  const UINT flags = (device->GetCreationFlags() & D3D11_CREATE_DEVICE_SINGLETHREADED) != 0
                         ? D3D11_1_CREATE_DEVICE_CONTEXT_STATE_SINGLETHREADED
                         : 0;
  hr = device1->CreateDeviceContextState(flags, &level, 1, D3D11_SDK_VERSION, __uuidof(ID3D11Device), nullptr,
                                         &renderer->ourState_);
  if (FAILED(hr)) {
    Log("renderer: CreateDeviceContextState failed (0x%08lX)", hr);
    return nullptr;
  }
  if (!renderer->CreatePipeline()) return nullptr;
  Log("renderer: D3D11 on the game's device (feature level 0x%X)", static_cast<unsigned>(level));
  return renderer;
}

std::unique_ptr<GuideRenderer> GuideRenderer::CreateForD3D12(ID3D12Device* device, ID3D12CommandQueue* queue) {
  if (device == nullptr || queue == nullptr) return nullptr;
  std::unique_ptr<GuideRenderer> renderer(new GuideRenderer());
  renderer->api_ = GraphicsApi::D3D12;

  const D3D_FEATURE_LEVEL levels[] = {D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0};
  IUnknown* const queues[] = {queue};
  D3D_FEATURE_LEVEL chosen = D3D_FEATURE_LEVEL_11_0;
  HRESULT hr = D3D11On12CreateDevice(device, D3D11_CREATE_DEVICE_BGRA_SUPPORT, levels, static_cast<UINT>(std::size(levels)),
                                     queues, 1, 0, &renderer->device_, &renderer->context_, &chosen);
  if (SUCCEEDED(hr)) hr = renderer->device_.As(&renderer->device11on12_);
  if (FAILED(hr)) {
    Log("renderer: D3D11On12CreateDevice failed (0x%08lX)", hr);
    return nullptr;
  }
  if (!renderer->CreatePipeline()) return nullptr;
  Log("renderer: D3D12 through D3D11On12 on the game's queue (feature level 0x%X)", static_cast<unsigned>(chosen));
  return renderer;
}

GuideRenderer::~GuideRenderer() {
  EndFrame();
  eyes_.clear();
  if (api_ == GraphicsApi::D3D12 && context_) {
    // Our own device: drop its bindings and submit anything still queued.
    context_->ClearState();
    context_->Flush();
  }
}

bool GuideRenderer::CreatePipeline() {
  const D3DCompileFn compile = LoadCompiler();
  if (compile == nullptr) {
    Log("renderer: d3dcompiler_47.dll is not available");
    return false;
  }
  const ComPtr<ID3DBlob> vs = Compile(compile, "VsMain", "vs_4_0");
  const ComPtr<ID3DBlob> ps = Compile(compile, "PsMain", "ps_4_0");
  if (!vs || !ps) return false;

  HRESULT hr = device_->CreateVertexShader(vs->GetBufferPointer(), vs->GetBufferSize(), nullptr, &vertexShader_);
  if (SUCCEEDED(hr)) hr = device_->CreatePixelShader(ps->GetBufferPointer(), ps->GetBufferSize(), nullptr, &pixelShader_);

  const D3D11_INPUT_ELEMENT_DESC layout[] = {
      {"POSITION", 0, DXGI_FORMAT_R32G32B32_FLOAT, 0, 0, D3D11_INPUT_PER_VERTEX_DATA, 0},
      {"COLOR", 0, DXGI_FORMAT_R32G32B32A32_FLOAT, 0, 12, D3D11_INPUT_PER_VERTEX_DATA, 0},
  };
  if (SUCCEEDED(hr)) {
    hr = device_->CreateInputLayout(layout, static_cast<UINT>(std::size(layout)), vs->GetBufferPointer(),
                                    vs->GetBufferSize(), &inputLayout_);
  }

  D3D11_BUFFER_DESC constants{};
  constants.ByteWidth = sizeof(guide::Mat4);
  constants.Usage = D3D11_USAGE_DEFAULT;
  constants.BindFlags = D3D11_BIND_CONSTANT_BUFFER;
  if (SUCCEEDED(hr)) hr = device_->CreateBuffer(&constants, nullptr, &constants_);

  // Premultiplied "over", in linear space when the target is _SRGB.
  D3D11_BLEND_DESC blend{};
  D3D11_RENDER_TARGET_BLEND_DESC& target = blend.RenderTarget[0];
  target.BlendEnable = TRUE;
  target.SrcBlend = D3D11_BLEND_ONE;
  target.DestBlend = D3D11_BLEND_INV_SRC_ALPHA;
  target.BlendOp = D3D11_BLEND_OP_ADD;
  target.SrcBlendAlpha = D3D11_BLEND_ONE;
  target.DestBlendAlpha = D3D11_BLEND_INV_SRC_ALPHA;
  target.BlendOpAlpha = D3D11_BLEND_OP_ADD;
  target.RenderTargetWriteMask = D3D11_COLOR_WRITE_ENABLE_ALL;
  if (SUCCEEDED(hr)) hr = device_->CreateBlendState(&blend, &blend_);

  // No culling: ribbon winding flips with direction, and boards are seen from either side.
  D3D11_RASTERIZER_DESC rasterizer{};
  rasterizer.FillMode = D3D11_FILL_SOLID;
  rasterizer.CullMode = D3D11_CULL_NONE;
  rasterizer.DepthClipEnable = TRUE;
  rasterizer.MultisampleEnable = TRUE;
  if (SUCCEEDED(hr)) hr = device_->CreateRasterizerState(&rasterizer, &rasterizer_);

  if (FAILED(hr)) {
    Log("renderer: pipeline creation failed (0x%08lX)", hr);
    return false;
  }
  return true;
}

bool GuideRenderer::SetEyeImagesD3D11(size_t eye, const std::vector<ID3D11Texture2D*>& images, DXGI_FORMAT format,
                                      uint32_t width, uint32_t height) {
  std::vector<ComPtr<ID3D11Texture2D>> owned(images.begin(), images.end());
  return BindEyeImages(eye, std::move(owned), format, width, height);
}

bool GuideRenderer::SetEyeImagesD3D12(size_t eye, const std::vector<ID3D12Resource*>& images, DXGI_FORMAT format,
                                      uint32_t width, uint32_t height) {
  if (!device11on12_) return false;
  std::vector<ComPtr<ID3D11Texture2D>> wrapped;
  wrapped.reserve(images.size());
  for (ID3D12Resource* image : images) {
    // OpenXR hands out D3D12 colour images in RENDER_TARGET and wants them back in it.
    D3D11_RESOURCE_FLAGS flags{};
    flags.BindFlags = D3D11_BIND_RENDER_TARGET;
    ComPtr<ID3D11Texture2D> texture;
    const HRESULT hr = device11on12_->CreateWrappedResource(image, &flags, D3D12_RESOURCE_STATE_RENDER_TARGET,
                                                            D3D12_RESOURCE_STATE_RENDER_TARGET, IID_PPV_ARGS(&texture));
    if (FAILED(hr)) {
      Log("renderer: CreateWrappedResource failed (0x%08lX)", hr);
      return false;
    }
    wrapped.push_back(std::move(texture));
  }
  return BindEyeImages(eye, std::move(wrapped), format, width, height);
}

bool GuideRenderer::BindEyeImages(size_t eye, std::vector<ComPtr<ID3D11Texture2D>> images, DXGI_FORMAT format,
                                  uint32_t width, uint32_t height) {
  if (eye >= eyes_.size()) eyes_.resize(eye + 1);
  eyes_[eye] = EyeTarget{};

  EyeTarget target;
  target.format = format;
  target.width = width;
  target.height = height;
  // Explicit view format: runtimes may create the images typeless.
  D3D11_RENDER_TARGET_VIEW_DESC viewDesc{};
  viewDesc.Format = format;
  viewDesc.ViewDimension = D3D11_RTV_DIMENSION_TEXTURE2D;
  for (const ComPtr<ID3D11Texture2D>& image : images) {
    ComPtr<ID3D11RenderTargetView> view;
    const HRESULT hr = device_->CreateRenderTargetView(image.Get(), &viewDesc, &view);
    if (FAILED(hr)) {
      Log("renderer: CreateRenderTargetView failed (0x%08lX)", hr);
      return false;
    }
    target.views.push_back(std::move(view));
  }
  target.images = std::move(images);

  // 4x MSAA when the format allows it, resolved into the image; otherwise draw into the image.
  UINT support = 0;
  UINT quality = 0;
  const UINT needed = D3D11_FORMAT_SUPPORT_MULTISAMPLE_RENDERTARGET | D3D11_FORMAT_SUPPORT_MULTISAMPLE_RESOLVE;
  if (SUCCEEDED(device_->CheckFormatSupport(format, &support)) && (support & needed) == needed &&
      SUCCEEDED(device_->CheckMultisampleQualityLevels(format, kSampleCount, &quality)) && quality > 0) {
    D3D11_TEXTURE2D_DESC desc{};
    desc.Width = width;
    desc.Height = height;
    desc.MipLevels = 1;
    desc.ArraySize = 1;
    desc.Format = format;
    desc.SampleDesc.Count = kSampleCount;
    desc.Usage = D3D11_USAGE_DEFAULT;
    desc.BindFlags = D3D11_BIND_RENDER_TARGET;
    if (FAILED(device_->CreateTexture2D(&desc, nullptr, &target.msaa)) ||
        FAILED(device_->CreateRenderTargetView(target.msaa.Get(), nullptr, &target.msaaView))) {
      target.msaa.Reset();
      target.msaaView.Reset();
    }
  }

  eyes_[eye] = std::move(target);
  return true;
}

void GuideRenderer::ResetEye(size_t eye) {
  if (eye < eyes_.size()) eyes_[eye] = EyeTarget{};
}

bool GuideRenderer::BeginFrame(const std::vector<guide::Vertex>& vertices) {
  if (inFrame_ || vertices.empty()) return false;
  const auto count = static_cast<uint32_t>(vertices.size());
  if (count > vertexCapacity_) {
    uint32_t capacity = std::max<uint32_t>(vertexCapacity_, 4096);
    while (capacity < count) capacity *= 2;
    D3D11_BUFFER_DESC desc{};
    desc.ByteWidth = capacity * sizeof(guide::Vertex);
    desc.Usage = D3D11_USAGE_DYNAMIC;
    desc.BindFlags = D3D11_BIND_VERTEX_BUFFER;
    desc.CPUAccessFlags = D3D11_CPU_ACCESS_WRITE;
    vertexBuffer_.Reset();
    vertexCapacity_ = 0;
    const HRESULT hr = device_->CreateBuffer(&desc, nullptr, &vertexBuffer_);
    if (FAILED(hr)) {
      Log("renderer: vertex buffer creation failed (0x%08lX)", hr);
      return false;
    }
    vertexCapacity_ = capacity;
  }

  if (api_ == GraphicsApi::D3D11) context1_->SwapDeviceContextState(ourState_.Get(), &gameState_);
  inFrame_ = true;

  D3D11_MAPPED_SUBRESOURCE mapped{};
  const HRESULT hr = context_->Map(vertexBuffer_.Get(), 0, D3D11_MAP_WRITE_DISCARD, 0, &mapped);
  if (FAILED(hr)) {
    Log("renderer: vertex buffer Map failed (0x%08lX)", hr);
    return false;
  }
  std::memcpy(mapped.pData, vertices.data(), vertices.size() * sizeof(guide::Vertex));
  context_->Unmap(vertexBuffer_.Get(), 0);
  vertexCount_ = count;

  const UINT stride = sizeof(guide::Vertex);
  const UINT offset = 0;
  ID3D11Buffer* const vertexBuffer = vertexBuffer_.Get();
  ID3D11Buffer* const constants = constants_.Get();
  const float blendFactor[4] = {0.f, 0.f, 0.f, 0.f};
  context_->IASetInputLayout(inputLayout_.Get());
  context_->IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
  context_->IASetVertexBuffers(0, 1, &vertexBuffer, &stride, &offset);
  context_->VSSetShader(vertexShader_.Get(), nullptr, 0);
  context_->VSSetConstantBuffers(0, 1, &constants);
  context_->PSSetShader(pixelShader_.Get(), nullptr, 0);
  context_->RSSetState(rasterizer_.Get());
  context_->OMSetBlendState(blend_.Get(), blendFactor, 0xFFFFFFFF);
  context_->OMSetDepthStencilState(nullptr, 0);
  return true;
}

bool GuideRenderer::DrawEye(size_t eye, uint32_t imageIndex, const guide::Mat4& viewProjection) {
  if (!inFrame_ || eye >= eyes_.size() || imageIndex >= eyes_[eye].images.size()) return false;
  EyeTarget& target = eyes_[eye];
  ID3D11Texture2D* const image = target.images[imageIndex].Get();
  if (api_ == GraphicsApi::D3D12) {
    ID3D11Resource* const resource = image;
    device11on12_->AcquireWrappedResources(&resource, 1);
    acquired_.push_back(resource);
  }

  ID3D11RenderTargetView* const view = target.msaaView ? target.msaaView.Get() : target.views[imageIndex].Get();
  const float transparent[4] = {0.f, 0.f, 0.f, 0.f};
  context_->ClearRenderTargetView(view, transparent);
  context_->OMSetRenderTargets(1, &view, nullptr);
  D3D11_VIEWPORT viewport{};
  viewport.Width = static_cast<float>(target.width);
  viewport.Height = static_cast<float>(target.height);
  viewport.MaxDepth = 1.f;
  context_->RSSetViewports(1, &viewport);
  context_->UpdateSubresource(constants_.Get(), 0, nullptr, viewProjection.m, 0, 0);
  context_->Draw(vertexCount_, 0);
  if (target.msaa) {
    context_->OMSetRenderTargets(0, nullptr, nullptr);
    context_->ResolveSubresource(image, 0, target.msaa.Get(), 0, target.format);
  }
  return true;
}

void GuideRenderer::EndFrame() {
  if (!inFrame_) return;
  inFrame_ = false;
  // Unbind so our state holds no reference to a swapchain image.
  context_->OMSetRenderTargets(0, nullptr, nullptr);
  if (api_ == GraphicsApi::D3D12) {
    if (!acquired_.empty()) {
      device11on12_->ReleaseWrappedResources(acquired_.data(), static_cast<UINT>(acquired_.size()));
      acquired_.clear();
    }
    // Submit to the game's queue now, before the images are released back to the runtime.
    context_->Flush();
  } else {
    context1_->SwapDeviceContextState(gameState_.Get(), nullptr);
    gameState_.Reset();
  }
}

}  // namespace sprint::xr
