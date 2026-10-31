require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name             = 'FileProtection'
  s.version          = package['version']
  s.summary          = 'Backup exclusion and file protection for the Termix database'
  s.description      = 'Keeps the Termix database folder out of backups and encrypted until first unlock.'
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

  s.source_files = '**/*.{h,m,swift}'
end
