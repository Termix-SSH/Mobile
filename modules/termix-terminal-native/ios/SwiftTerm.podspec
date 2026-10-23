# SwiftTerm v1.99.1 (MIT, see SwiftTerm/LICENSE), vendored because it ships SwiftPM only.
# The Mac front end, docs and the Metal shader file are left out (the renderer
# compiles its shaders from source). SwiftTerm/Generated stands in for the build plugin.
Pod::Spec.new do |s|
  s.name    = 'SwiftTerm'
  s.version = '1.99.1'
  s.summary = 'VT100/Xterm terminal emulator (vendored for the Termix terminal spike).'
  s.author  = 'Miguel de Icaza'
  s.homepage = 'https://github.com/migueldeicaza/SwiftTerm'
  s.license  = { :type => 'MIT', :file => 'SwiftTerm/LICENSE' }
  s.source   = { :git => 'https://github.com/Termix-SSH/Mobile.git' }
  s.static_framework = true

  s.ios.deployment_target = '16.4'
  s.swift_version = '6.0'

  s.source_files = 'SwiftTerm/**/*.swift'
  s.frameworks = 'UIKit', 'CoreText', 'Metal', 'MetalKit', 'QuartzCore'
end
