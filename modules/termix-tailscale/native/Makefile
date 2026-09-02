# Build the Termix Tailscale C archive from official tailscale.com/tsnet.
#
#   make host     # current machine (dev / tests)
#   make ios      # iOS device arm64 archive → ../ios/lib/libtermix_ts.a
#   make android  # needs ANDROID_NDK_HOME or ANDROID_NDK_ROOT
#
# Without a successful Go build, the mobile bridges use stub.c so direct mode
# still links; Tailscale itself remains unavailable until the native library is built.

ROOT := $(abspath .)
IOS_OUT := $(abspath ../ios/lib)
ANDROID_OUT := $(abspath ../android/src/main/jniLibs)
HEADER := termix_ts.h

# Android's NDK prebuilt directory uses a host-specific tag. Official NDK
# distributions currently use x86_64 tool binaries on both macOS and Linux,
# including Apple Silicon hosts (via the platform's compatibility layer). Allow
# callers to override the tag for a custom/native NDK layout.
ANDROID_NDK_DIR := $(strip $(ANDROID_NDK_HOME))
ifeq ($(ANDROID_NDK_DIR),)
ANDROID_NDK_DIR := $(strip $(ANDROID_NDK_ROOT))
endif
HOST_OS := $(shell uname -s)
ifeq ($(strip $(ANDROID_NDK_HOST_TAG)),)
ifeq ($(HOST_OS),Darwin)
ANDROID_NDK_HOST_TAG := darwin-x86_64
else ifeq ($(HOST_OS),Linux)
ANDROID_NDK_HOST_TAG := linux-x86_64
else
ANDROID_NDK_HOST_TAG := unsupported
endif
endif
ANDROID_CLANG := $(ANDROID_NDK_DIR)/toolchains/llvm/prebuilt/$(ANDROID_NDK_HOST_TAG)/bin/aarch64-linux-android24-clang

.PHONY: host ios android clean deps tidy

deps:
	go mod download
	go mod verify

tidy:
	go mod tidy

host: deps
	CGO_ENABLED=1 go build -buildmode=c-archive -o $(ROOT)/libtermix_ts_host.a .
	cp $(HEADER) $(ROOT)/libtermix_ts_host.h 2>/dev/null || true

# Device archive (App Store / device runs). Requires Xcode + iOS SDK.
ios: deps
	mkdir -p $(IOS_OUT)
	GOOS=ios GOARCH=arm64 CGO_ENABLED=1 \
		CC=$(ROOT)/clangwrap-ios.sh \
		go build -tags ios -buildmode=c-archive -o $(IOS_OUT)/libtermix_ts.a .
	cp $(HEADER) $(IOS_OUT)/termix_ts.h
	@echo "Installed $(IOS_OUT)/libtermix_ts.a"

# arm64-v8a shared library for Android. Use 16 KB ELF segment alignment so
# the library loads on Android devices with 16 KB system page sizes.
android: deps
	@test -n "$(ANDROID_NDK_DIR)" || (echo "Set ANDROID_NDK_HOME or ANDROID_NDK_ROOT" && exit 1)
	@test -x "$(ANDROID_CLANG)" || (echo "Android compiler not found: $(ANDROID_CLANG)" && exit 1)
	mkdir -p $(ANDROID_OUT)/arm64-v8a
	GOOS=android GOARCH=arm64 CGO_ENABLED=1 \
		CC="$(ANDROID_CLANG)" \
		go build -ldflags="-checklinkname=0 -extldflags=-Wl,-z,max-page-size=16384" \
			-buildmode=c-shared -o $(ANDROID_OUT)/arm64-v8a/libtermix_ts.so .
	cp $(HEADER) $(ANDROID_OUT)/termix_ts.h
	@echo "Installed $(ANDROID_OUT)/arm64-v8a/libtermix_ts.so"

clean:
	rm -f libtermix_ts_host.a libtermix_ts_host.h
	rm -f $(IOS_OUT)/libtermix_ts.a $(IOS_OUT)/termix_ts.h
	rm -rf $(ANDROID_OUT)
