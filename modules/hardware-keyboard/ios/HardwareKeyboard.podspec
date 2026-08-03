require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name             = 'HardwareKeyboard'
  s.version          = package['version']
  s.summary          = 'Hardware keyboard support for Termix sessions'
  s.description      = 'Native iOS hardware keyboard integration for Termix session shortcuts and control sequences.'
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

  s.source_files = '**/*.{h,m,swift}'
end
