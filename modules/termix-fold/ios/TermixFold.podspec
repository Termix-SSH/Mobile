# The fold APIs only exist in the iOS 27.1 SDK. Swift 6.4 ships with 27.0 too,
# so the SDK version decides whether the fold code is compiled.
sdk = `xcrun --sdk iphoneos --show-sdk-version 2>/dev/null`.strip
duo_sdk = begin
  Gem::Version.new(sdk) >= Gem::Version.new('27.1')
rescue ArgumentError
  false
end

Pod::Spec.new do |s|
  s.name           = 'TermixFold'
  s.version        = '0.1.0'
  s.summary        = 'Reports where a foldable screen bends'
  s.author         = 'Termix'
  s.homepage       = 'https://github.com/Termix-SSH/Mobile'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: 'https://github.com/Termix-SSH/Mobile.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  config = { 'DEFINES_MODULE' => 'YES' }
  config['SWIFT_ACTIVE_COMPILATION_CONDITIONS'] = '$(inherited) TERMIX_DUO_SDK' if duo_sdk
  s.pod_target_xcconfig = config
  s.source_files = '*.swift'
end
