# Sprint's OpenXR API layer: draws the driving guide into the headset view of games that render
# through OpenXR. The layer DLL is Windows x64 only; the geometry core and its test build anywhere.
cmake_minimum_required(VERSION 3.20)
project(SprintOpenXrLayer VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Static MSVC runtime: the DLL loads inside a game process and must not depend on a redist.
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

if(MSVC)
  add_compile_options(/W4 /permissive- /utf-8)
else()
  add_compile_options(-Wall -Wextra)
endif()

# Portable geometry: no Windows or OpenXR headers.
add_library(guide_math STATIC src/guide_math.cpp)
target_include_directories(guide_math PUBLIC src)

enable_testing()
add_executable(guide_math_test tests/guide_math_test.cpp)
target_link_libraries(guide_math_test PRIVATE guide_math)
add_test(NAME guide_math_test COMMAND guide_math_test)

if(WIN32)
  if(NOT CMAKE_SIZEOF_VOID_P EQUAL 8)
    message(FATAL_ERROR "The OpenXR layer is x64 only. Configure with -A x64.")
  endif()

  # OpenXR headers only. SOURCE_SUBDIR points at a folder without a CMakeLists.txt, so the SDK is
  # downloaded but not added to the build (no loader).
  include(FetchContent)
  FetchContent_Declare(
    openxr_sdk
    URL https://github.com/KhronosGroup/OpenXR-SDK/archive/refs/tags/release-1.1.38.tar.gz
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
    SOURCE_SUBDIR headers-only-do-not-build)
  FetchContent_MakeAvailable(openxr_sdk)

  set(SPRINT_XR_LAYER_NAME XR_APILAYER_SPRINT_driving_guide)

  add_library(sprint_xr_layer SHARED
    src/layer.cpp
    src/layer_log.cpp
    src/guide_feed.cpp
    src/renderer_d3d11.cpp)
  set_target_properties(sprint_xr_layer PROPERTIES OUTPUT_NAME ${SPRINT_XR_LAYER_NAME})
  target_include_directories(sprint_xr_layer PRIVATE src ${openxr_sdk_SOURCE_DIR}/include)
  target_compile_definitions(sprint_xr_layer PRIVATE
    XR_NO_PROTOTYPES
    XR_USE_PLATFORM_WIN32
    XR_USE_GRAPHICS_API_D3D11
    XR_USE_GRAPHICS_API_D3D12
    WIN32_LEAN_AND_MEAN
    NOMINMAX
    UNICODE
    _UNICODE
    SPRINT_XR_LAYER_NAME="${SPRINT_XR_LAYER_NAME}"
    SPRINT_XR_LAYER_VERSION="${PROJECT_VERSION}")
  # d3dcompiler_47.dll is loaded at runtime, so a missing compiler sends us to passthrough instead
  # of failing the DLL load.
  target_link_libraries(sprint_xr_layer PRIVATE guide_math d3d11)

  # The loader resolves library_path relative to the manifest, so the manifest sits next to the DLL.
  set(SPRINT_XR_LAYER_LIBRARY ${SPRINT_XR_LAYER_NAME}.dll)
  configure_file(${SPRINT_XR_LAYER_NAME}.json.in ${CMAKE_CURRENT_BINARY_DIR}/${SPRINT_XR_LAYER_NAME}.json @ONLY)
  add_custom_command(TARGET sprint_xr_layer POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
      ${CMAKE_CURRENT_BINARY_DIR}/${SPRINT_XR_LAYER_NAME}.json $<TARGET_FILE_DIR:sprint_xr_layer>)
endif()
