package expo.modules.termixwidgets

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Bridges the JS widget layer to the Android home screen.
 *
 * The app writes one JSON snapshot into shared preferences; the widget
 * providers read it back in the launcher's process. Keeping the transport to a
 * single string keeps the two sides decoupled — the contract lives in
 * `app/widgets/types.ts`.
 */
class TermixWidgetsModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("TermixWidgets")

    Constants(
      "isSupported" to true,
      "containerId" to SnapshotStore.PREFERENCES_NAME
    )

    AsyncFunction("setSnapshot") { json: String ->
      SnapshotStore.write(context, json)
      WidgetUpdater.updateAll(context)
    }

    AsyncFunction("clearSnapshot") {
      SnapshotStore.clear(context)
      WidgetUpdater.updateAll(context)
    }

    AsyncFunction("reloadWidgets") {
      WidgetUpdater.updateAll(context)
    }
  }
}
