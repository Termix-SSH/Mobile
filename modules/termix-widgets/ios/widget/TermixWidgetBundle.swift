import SwiftUI
import WidgetKit

/// Entry point of the widget extension. Both widget kinds appear in the gallery.
@main
struct TermixWidgetBundle: WidgetBundle {
  var body: some Widget {
    QuickConnectWidget()
    StatusWidget()
    SnippetsWidget()
  }
}
