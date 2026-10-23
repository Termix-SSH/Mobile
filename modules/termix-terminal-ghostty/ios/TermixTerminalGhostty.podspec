require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'TermixTerminalGhostty'
  s.version        = package['version']
  s.summary        = 'Termix terminal spike: libghostty engine'
  s.description    = 'Ghostty terminal view for Termix, based on expo-libghostty'
  s.author         = 'Termix'
  s.homepage       = 'https://github.com/Termix-SSH/Mobile'
  s.license        = { :type => 'MIT' }
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: 'https://github.com/Termix-SSH/Mobile.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'GhosttyTerminal'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  # Module sources only - the vendored pods own everything under vendor/.
  s.source_files = '*.{h,m,mm,swift,hpp,cpp}'
  s.resource_bundles = { 'TermixTerminalGhostty_privacy' => 'privacy/TermixTerminalGhostty/PrivacyInfo.xcprivacy' }
end
