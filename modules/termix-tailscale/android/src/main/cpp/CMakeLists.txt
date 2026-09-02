cmake_minimum_required(VERSION 3.22.1)

project(termix_ts_jni)

# JNI bridge over the Go tsnet library (libtermix_ts.so, prebuilt per ABI).
add_library(termix_ts_jni SHARED termix_ts_jni.c)

# Headers live in jniLibs/ (termix_ts.h); the Go .so lives in jniLibs/<abi>/.
# The checked-in native header and iOS stub keep a clean checkout buildable in
# direct mode; CI builds the real Go library before packaging Tailscale support.
set(JNILIBS_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../jniLibs")
set(ABI_DIR "${JNILIBS_DIR}/${ANDROID_ABI}")
set(GO_LIBRARY "${ABI_DIR}/libtermix_ts.so")
set(GO_HEADER "${JNILIBS_DIR}/termix_ts.h")
set(NATIVE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../../native")
set(STUB_SOURCE "${CMAKE_CURRENT_SOURCE_DIR}/../../../../ios/stub.c")

# Re-evaluate the real-library/stub choice when generated artifacts appear or
# change between Gradle invocations.
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS
  "${GO_LIBRARY}"
  "${GO_HEADER}"
)

if(NOT EXISTS "${GO_HEADER}")
  message(STATUS "Go header missing; using checked-in native header")
endif()
if(NOT EXISTS "${GO_LIBRARY}")
  message(WARNING "libtermix_ts.so missing for ${ANDROID_ABI}; building unavailable stub")
endif()

target_include_directories(termix_ts_jni PRIVATE
  "${JNILIBS_DIR}"
  "${ABI_DIR}"
  "${NATIVE_DIR}"
)

if(EXISTS "${GO_LIBRARY}")
  add_library(termix_ts_prebuilt SHARED IMPORTED GLOBAL)
  set_target_properties(termix_ts_prebuilt PROPERTIES
    IMPORTED_LOCATION "${GO_LIBRARY}"
  )
  target_link_libraries(termix_ts_jni PRIVATE termix_ts_prebuilt)
else()
  add_library(termix_ts_stub STATIC "${STUB_SOURCE}")
  set_target_properties(termix_ts_stub PROPERTIES POSITION_INDEPENDENT_CODE ON)
  target_include_directories(termix_ts_stub PRIVATE "${NATIVE_DIR}")
  target_link_libraries(termix_ts_jni PRIVATE termix_ts_stub)
endif()

target_link_libraries(termix_ts_jni PRIVATE log)
