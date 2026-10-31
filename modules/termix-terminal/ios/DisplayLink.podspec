# Vendored from https://github.com/Lakr233/DisplayLink (MIT), see ios/vendor/README.md.
# Upstream ships SPM only; this pod exists because CocoaPods cannot use SPM packages.
Pod::Spec.new do |s|
  s.name    = 'DisplayLink'
  s.version = '3.0.1'
  s.summary = 'Cross-platform DisplayLink (vendored).'
  s.author  = { 'Lakr233' => 'https://github.com/Lakr233' }
  s.homepage = 'https://github.com/Lakr233/DisplayLink'
  s.license  = { :type => 'MIT', :file => 'vendor/LICENSE-DisplayLink.txt' }
  s.source   = { :git => 'https://github.com/Termix-SSH/Mobile.git' }
  s.static_framework = true

  s.ios.deployment_target = '16.4'
  s.swift_version = '6.0'

  s.source_files = 'vendor/DisplayLink/**/*.swift'
  s.resource_bundles = { 'DisplayLink_privacy' => 'privacy/DisplayLink/PrivacyInfo.xcprivacy' }
end
