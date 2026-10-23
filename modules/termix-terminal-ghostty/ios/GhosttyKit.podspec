# Vendored from https://github.com/Lakr233/libghostty-spm (MIT) - see ios/vendor/README.md.
# Re-exports the libghostty C API from the pre-built XCFramework, which
# scripts/download-xcframework.mjs fetches (checksum-pinned) at install time.
Pod::Spec.new do |s|
  s.name    = 'GhosttyKit'
  s.version = '1.3.1'
  s.summary = "Ghostty's libghostty C API for Apple platforms (vendored by expo-libghostty)."
  s.author  = { 'Lakr233' => 'https://github.com/Lakr233' }
  s.homepage = 'https://github.com/Lakr233/libghostty-spm'
  s.license  = { :type => 'MIT', :file => 'vendor/LICENSE-libghostty-spm.txt' }
  s.source   = { :git => 'https://github.com/arcboxlabs/expo-libghostty.git' }
  s.static_framework = true

  s.ios.deployment_target = '16.4'
  s.swift_version = '6.0'

  s.source_files = 'vendor/GhosttyKit/**/*.swift'
  s.vendored_frameworks = 'vendor/Frameworks/GhosttyKit.xcframework'
  s.libraries = 'c++'
  s.resource_bundles = { 'GhosttyKit_privacy' => 'privacy/GhosttyKit/PrivacyInfo.xcprivacy' }
end
