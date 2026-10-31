cmake_minimum_required(VERSION 3.22.1)
project(termixterminal CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Prebuilt libghostty-vt for this ABI (fetched into vendor/ at install time;
# see scripts/ and vendor-manifest.json).
add_library(ghostty-vt STATIC IMPORTED)
set_target_properties(ghostty-vt PROPERTIES
  IMPORTED_LOCATION ${CMAKE_CURRENT_SOURCE_DIR}/vendor/${ANDROID_ABI}/libghostty-vt.a)

add_library(termixterminal SHARED src/main/cpp/ghostty_jni.cpp)

target_include_directories(termixterminal PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/vendor/include)
# Static linking: keep GHOSTTY_API a no-op (see ghostty/vt/types.h).
target_compile_definitions(termixterminal PRIVATE GHOSTTY_STATIC)
target_compile_options(termixterminal PRIVATE -Wall -fvisibility=hidden)
# Android 15+ devices require 16 KB page alignment.
target_link_options(termixterminal PRIVATE -Wl,-z,max-page-size=16384)

if(ANDROID_ABI STREQUAL "x86_64")
  # Zig emits general-dynamic TLS on x86_64, which needs __tls_get_addr;
  # bionic only exports it from API 29. Let it stay undefined at link time
  # (overrides AGP's --no-undefined): x86_64 is an emulator-only ABI and
  # API 29+ emulators resolve it from libc.so at load.
  target_link_options(termixterminal PRIVATE -Wl,-z,undefs)
endif()

target_link_libraries(termixterminal ghostty-vt log)
