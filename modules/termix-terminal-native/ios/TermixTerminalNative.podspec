require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'TermixTerminalNative'
  s.version        = package['version']
  s.summary        = 'Termix terminal spike: SwiftTerm engine'
  s.author         = 'Termix'
  s.homepage       = 'https://github.com/Termix-SSH/Mobile'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: 'https://github.com/Termix-SSH/Mobile.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'SwiftTerm'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '*.swift'
end
