Pod::Spec.new do |s|
  s.name           = 'TermixWidgets'
  s.version        = '1.0.0'
  s.summary        = 'Bridges Termix host data to the iOS home-screen widgets.'
  s.description    = 'Writes the widget snapshot into the shared App Group container and reloads WidgetKit timelines.'
  s.author         = 'Termix'
  s.homepage       = 'https://github.com/Termix-SSH/Mobile'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: 'https://github.com/Termix-SSH/Mobile' }
  s.license        = { :type => 'MIT' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  # Only the module bridge is compiled into the app. Everything under `widget/`
  # belongs to the WidgetKit extension target, which the config plugin creates.
  s.source_files = '*.{h,m,mm,swift,hpp,cpp}'
end
