Pod::Spec.new do |s|
  s.name           = 'TermixFrameMonitor'
  s.version        = '0.1.0'
  s.summary        = 'Log lines and launch URL for the Termix showcase build'
  s.author         = 'Termix'
  s.homepage       = 'https://github.com/Termix-SSH/Mobile'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: 'https://github.com/Termix-SSH/Mobile.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '*.swift'
end
