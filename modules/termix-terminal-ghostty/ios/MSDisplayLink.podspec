# Vendored from https://github.com/Lakr233/MSDisplayLink (MIT) - see ios/vendor/README.md.
# Upstream ships SPM only; this pod exists because CocoaPods cannot consume SPM packages.
Pod::Spec.new do |s|
  s.name    = 'MSDisplayLink'
  s.version = '2.1.0'
  s.summary = 'Cross-platform DisplayLink (vendored by expo-libghostty).'
  s.author  = { 'Lakr233' => 'https://github.com/Lakr233' }
  s.homepage = 'https://github.com/Lakr233/MSDisplayLink'
  s.license  = { :type => 'MIT', :file => 'vendor/LICENSE-MSDisplayLink.txt' }
  s.source   = { :git => 'https://github.com/arcboxlabs/expo-libghostty.git' }
  s.static_framework = true

  s.ios.deployment_target = '16.4'
  s.swift_version = '6.0'

  s.source_files = 'vendor/MSDisplayLink/**/*.swift'
  s.resource_bundles = { 'MSDisplayLink_privacy' => 'privacy/MSDisplayLink/PrivacyInfo.xcprivacy' }
end
