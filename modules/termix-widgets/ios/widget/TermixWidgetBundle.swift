import SwiftUI
import WidgetKit

/**
 Entry point of the widget extension.

 On iOS 17 the Quick Connect and Server Status widgets are configurable: the
 user picks a host under "Edit Widget". Older versions get the static variants,
 which follow the automatic ordering (pinned, then online, then by name).

 A configurable widget reuses the static one's `kind`, so a widget placed before
 this shipped keeps working and simply gains the picker.
 */
@main
struct TermixWidgetBundle: WidgetBundle {
  var body: some Widget {
    if #available(iOSApplicationExtension 17.0, *) {
      ConfigurableQuickConnectWidget()
      ConfigurableStatusWidget()
    } else {
      QuickConnectWidget()
      StatusWidget()
    }
    // Snippets are not host-specific: the target is chosen in the app when the
    // command runs, so there is nothing to configure here.
    SnippetsWidget()
  }
}
