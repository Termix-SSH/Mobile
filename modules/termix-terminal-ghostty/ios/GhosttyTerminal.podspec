# Vendored from https://github.com/Lakr233/libghostty-spm (MIT) - see ios/vendor/README.md.
# Swift wrapper layer: native terminal views, input/IME handling, display link.
Pod::Spec.new do |s|
  s.name    = 'GhosttyTerminal'
  s.version = '1.3.1'
  s.summary = 'Ghostty-powered native terminal view (vendored by expo-libghostty).'
  s.author  = { 'Lakr233' => 'https://github.com/Lakr233' }
  s.homepage = 'https://github.com/Lakr233/libghostty-spm'
  s.license  = { :type => 'MIT', :file => 'vendor/LICENSE-libghostty-spm.txt' }
  s.source   = { :git => 'https://github.com/arcboxlabs/expo-libghostty.git' }
  s.static_framework = true

  s.ios.deployment_target = '16.4'
  s.swift_version = '6.0'

  s.dependency 'GhosttyKit'
  s.dependency 'MSDisplayLink'

  s.source_files = 'vendor/GhosttyTerminal/**/*.swift'
  s.resource_bundles = { 'GhosttyTerminal_privacy' => 'privacy/GhosttyTerminal/PrivacyInfo.xcprivacy' }
end
