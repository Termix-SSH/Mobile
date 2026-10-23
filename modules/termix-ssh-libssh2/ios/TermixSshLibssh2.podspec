Pod::Spec.new do |s|
  s.name             = 'TermixSshLibssh2'
  s.version          = '0.0.0'
  s.summary          = 'SSH engine spike for Termix'
  s.description      = 'Links the libssh2 SSH engine so CI can measure it. Not shipped.'
  s.license          = { type: 'Apache-2.0' }
  s.author           = 'Termix'
  s.homepage         = 'https://github.com/Termix-SSH/Mobile'
  s.platforms        = { :ios => '15.1' }
  s.swift_version    = '5.9'
  s.source           = { git: 'https://github.com/Termix-SSH/Mobile.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  # spikes/ssh-engine/scripts/expo-prepare.sh fills Vendor/
  s.source_files = '*.swift', 'Vendor/**/*.swift'
  s.vendored_frameworks = 'Vendor/TermixSsh2.xcframework'
end
