require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

lib_dir = File.join(__dir__, 'lib')
native_dir = File.expand_path(File.join(__dir__, '..', 'native'))
has_go_archive = File.exist?(File.join(lib_dir, 'libtermix_ts.a'))

Pod::Spec.new do |s|
  s.name           = 'TermixTailscale'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = { :type => 'Apache-2.0' }
  s.author         = 'Termix'
  s.homepage       = 'https://github.com/Termix-SSH/Mobile'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/Termix-SSH/Mobile.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # No SWIFT_OBJC_BRIDGING_HEADER — CocoaPods framework targets reject it.
  # TermixTSBridge.h is public so the co-located Swift module can see it.

  s.source_files = 'TermixTailscaleModule.swift', 'TermixTSBridge.{h,m}'
  s.public_header_files = 'TermixTSBridge.h'

  # Frameworks commonly required by Go/tsnet on Darwin/iOS.
  s.frameworks = 'Security', 'Network', 'SystemConfiguration', 'CoreFoundation', 'CFNetwork'
  s.libraries = 'resolv'

  if has_go_archive
    # Link the Go c-archive once via vendored_libraries only.
    # Do NOT also -force_load the same .a (duplicate symbols).
    # TermixTSBridge.m references TermixTS_* so those objects stay live;
    # if a later link needs Go runtime ctor retention we can revisit.
    s.vendored_libraries = 'lib/libtermix_ts.a'
    s.preserve_paths = 'lib/*'
    s.pod_target_xcconfig = {
      'DEFINES_MODULE' => 'YES',
      'CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES' => 'YES',
      'HEADER_SEARCH_PATHS' => '"$(PODS_TARGET_SRCROOT)/lib"'
    }
  else
    # Dev without a prebuilt Go archive: compile the failing stub so the app links.
    s.source_files = 'TermixTailscaleModule.swift', 'TermixTSBridge.{h,m}', 'stub.c'
    s.pod_target_xcconfig = {
      'DEFINES_MODULE' => 'YES',
      'CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES' => 'YES',
      'HEADER_SEARCH_PATHS' => "\"#{native_dir}\" \"$(PODS_TARGET_SRCROOT)/../native\""
    }
  end
end
