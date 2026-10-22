// Draws the guide mesh into the layer's own swapchain images with D3D11: on the game's device for
// D3D11 sessions, on a D3D11On12 device over the game's queue for D3D12 sessions.
#pragma once

#include <windows.h>
#include <d3d11_1.h>
#include <d3d11on12.h>
#include <d3d12.h>
#include <wrl/client.h>

#include <cstdint>
#include <memory>
#include <vector>

#include "guide_math.h"

namespace sprint::xr {

enum class GraphicsApi { D3D11, D3D12 };

// One per session. Usage per frame: BeginFrame, then DrawEye for each view, then EndFrame. Call
// EndFrame after every BeginFrame, whatever it returned: a failed BeginFrame may already have
// swapped the game's D3D11 state out. Methods return false on failure after logging why; the
// caller then stops drawing for the session. Never throws.
class GuideRenderer {
 public:
  // Null when the device cannot support us (logged).
  static std::unique_ptr<GuideRenderer> CreateForD3D11(ID3D11Device* device);
  static std::unique_ptr<GuideRenderer> CreateForD3D12(ID3D12Device* device, ID3D12CommandQueue* queue);

  GuideRenderer(const GuideRenderer&) = delete;
  GuideRenderer& operator=(const GuideRenderer&) = delete;
  ~GuideRenderer();

  GraphicsApi Api() const { return api_; }

  // Binds an eye to a swapchain's images (the runtime's textures; we do not own them). `format`
  // is the swapchain format, used for views and the resolve because images may be typeless.
  bool SetEyeImagesD3D11(size_t eye, const std::vector<ID3D11Texture2D*>& images, DXGI_FORMAT format,
                         uint32_t width, uint32_t height);
  bool SetEyeImagesD3D12(size_t eye, const std::vector<ID3D12Resource*>& images, DXGI_FORMAT format,
                         uint32_t width, uint32_t height);

  // Drops an eye's views, wrappers and MSAA target. Call before destroying its swapchain.
  void ResetEye(size_t eye);

  // Uploads this frame's mesh (shared by all eyes).
  bool BeginFrame(const std::vector<guide::Vertex>& vertices);
  // Clears the eye's acquired image to transparent and draws the mesh with that eye's matrix.
  bool DrawEye(size_t eye, uint32_t imageIndex, const guide::Mat4& viewProjection);
  // Restores the game's D3D11 state, or hands the wrapped images back to D3D12 and flushes.
  void EndFrame();

 private:
  struct EyeTarget {
    std::vector<Microsoft::WRL::ComPtr<ID3D11Texture2D>> images;
    std::vector<Microsoft::WRL::ComPtr<ID3D11RenderTargetView>> views;
    Microsoft::WRL::ComPtr<ID3D11Texture2D> msaa;
    Microsoft::WRL::ComPtr<ID3D11RenderTargetView> msaaView;
    DXGI_FORMAT format = DXGI_FORMAT_UNKNOWN;
    uint32_t width = 0;
    uint32_t height = 0;
  };

  GuideRenderer() = default;
  bool CreatePipeline();
  bool BindEyeImages(size_t eye, std::vector<Microsoft::WRL::ComPtr<ID3D11Texture2D>> images, DXGI_FORMAT format,
                     uint32_t width, uint32_t height);

  GraphicsApi api_ = GraphicsApi::D3D11;
  Microsoft::WRL::ComPtr<ID3D11Device> device_;
  Microsoft::WRL::ComPtr<ID3D11DeviceContext> context_;
  Microsoft::WRL::ComPtr<ID3D11On12Device> device11on12_;  // D3D12 sessions only
  // D3D11 sessions draw on the game's immediate context: swap in our own state and back.
  Microsoft::WRL::ComPtr<ID3D11DeviceContext1> context1_;
  Microsoft::WRL::ComPtr<ID3DDeviceContextState> ourState_;
  Microsoft::WRL::ComPtr<ID3DDeviceContextState> gameState_;

  Microsoft::WRL::ComPtr<ID3D11VertexShader> vertexShader_;
  Microsoft::WRL::ComPtr<ID3D11PixelShader> pixelShader_;
  Microsoft::WRL::ComPtr<ID3D11InputLayout> inputLayout_;
  Microsoft::WRL::ComPtr<ID3D11Buffer> constants_;
  Microsoft::WRL::ComPtr<ID3D11Buffer> vertexBuffer_;
  uint32_t vertexCapacity_ = 0;
  uint32_t vertexCount_ = 0;
  Microsoft::WRL::ComPtr<ID3D11BlendState> blend_;
  Microsoft::WRL::ComPtr<ID3D11RasterizerState> rasterizer_;

  std::vector<EyeTarget> eyes_;
  std::vector<ID3D11Resource*> acquired_;  // wrapped D3D12 images held by D3D11 this frame
  bool inFrame_ = false;
};

}  // namespace sprint::xr
