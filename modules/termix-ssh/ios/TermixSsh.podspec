require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name             = 'TermixSsh'
  s.version          = package['version']
  s.summary          = 'Native SSH and SFTP engine for Termix'
  s.description      = 'Rust russh core exposed to Swift through UniFFI, so the phone can open SSH itself.'
  s.license          = { type: 'Apache-2.0' }
  s.author           = 'Termix'
  s.homepage         = 'https://github.com/Termix-SSH/Mobile'
  s.platforms        = { :ios => '16.4' }
  s.swift_version    = '5.9'
  s.source           = { git: 'https://github.com/Termix-SSH/Mobile.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '*.swift', 'Generated/*.swift'
  # Fetched by scripts/fetch-ssh-engine.cjs during prebuild.
  s.vendored_frameworks = 'TermixSshCore.xcframework'
end
