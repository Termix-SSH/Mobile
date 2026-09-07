import SwiftUI
import WidgetKit

/**
 Entry point of the widget extension.

 On iOS 17 the Quick Connect and Server Status widgets are configurable: the
 user picks a host, and the tab it opens, under "Edit Widget". Older versions
 get the static variants, which follow the automatic ordering (pinned, then
 online, then by name) and always open their default tab.

 A configurable widget reuses the static one's `kind`, so a widget placed before
 this shipped keeps working and simply gains the picker.

 `WidgetBundleBuilder` has no `buildEither`, so the two sets cannot be chosen
 with an `if #available` inside one `body`. The availability split is done by
 picking a whole bundle in `main()` instead.
 */
@main
enum TermixWidgetBundle {
  static func main() {
    #if canImport(AppIntents)
      if #available(iOSApplicationExtension 17.0, *) {
        ConfigurableBundle.main()
        return
      }
    #endif
    LegacyBundle.main()
  }
}

#if canImport(AppIntents)
  /// iOS 17+: host and tab pickers on the two host-driven widgets.
  @available(iOSApplicationExtension 17.0, *)
  struct ConfigurableBundle: WidgetBundle {
    var body: some Widget {
      ConfigurableQuickConnectWidget()
      ConfigurableStatusWidget()
      // Snippets are not host-specific: the target is chosen in the app when
      // the command runs, so there is nothing to configure here. The modern
      // variant only differs in forcing full-colour rendering.
      ModernSnippetsWidget()
    }
  }
#endif

/// iOS 16: no configuration, so the static variants are used throughout.
struct LegacyBundle: WidgetBundle {
  var body: some Widget {
    QuickConnectWidget()
    StatusWidget()
    SnippetsWidget()
  }
}
