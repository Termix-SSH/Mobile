# Vendored from https://github.com/Lakr233/libghostty-spm (MIT), see ios/vendor/README.md.
# Swift wrapper layer: native terminal views, input and IME, touch selection, display link.
upcoming = %w[NonisolatedNonsendingByDefault InferIsolatedConformances MemberImportVisibility ExistentialAny]

Pod::Spec.new do |s|
  s.name    = 'GhosttyTerminal'
  s.version = '2.2.2026101502'
  s.summary = 'Ghostty-powered native terminal view (vendored).'
  s.author  = { 'Lakr233' => 'https://github.com/Lakr233' }
  s.homepage = 'https://github.com/Lakr233/libghostty-spm'
  s.license  = { :type => 'MIT', :file => 'vendor/LICENSE-libghostty-spm.txt' }
  s.source   = { :git => 'https://github.com/Termix-SSH/Mobile.git' }
  s.static_framework = true

  s.ios.deployment_target = '16.4'
  s.swift_version = '6.0'

  s.dependency 'GhosttyKit'
  s.dependency 'DisplayLink'

  # Same upcoming features the package turns on, so it builds the same as upstream.
  s.pod_target_xcconfig = {
    'OTHER_SWIFT_FLAGS' => upcoming.map { |f| "-enable-upcoming-feature #{f}" }.join(' ')
  }

  s.source_files = 'vendor/GhosttyTerminal/**/*.swift', 'pods/GhosttyTerminal/*.swift'
  s.resource_bundles = {
    'GhosttyTerminal_privacy' => 'privacy/GhosttyTerminal/PrivacyInfo.xcprivacy',
    'GhosttyTerminalResources' => [
      'vendor/GhosttyTerminal/Resources/Ghostty',
      'vendor/GhosttyTerminal/Resources/terminfo',
      'vendor/GhosttyTerminal/Resources/Localization/*.lproj'
    ]
  }
end
