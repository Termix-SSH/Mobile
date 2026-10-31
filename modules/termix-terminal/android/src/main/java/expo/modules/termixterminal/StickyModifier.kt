package expo.modules.termixterminal

/**
 * iOS-style sticky modifier state machine: tap arms the modifier for the
 * next key, a second tap within [DOUBLE_TAP_MS] locks it until tapped again,
 * and any other tap deactivates it. [now] is injected for testability
 * (production passes SystemClock.uptimeMillis).
 */
internal class StickyModifier(private val now: () -> Long) {
  enum class Activation { INACTIVE, ARMED, LOCKED }

  var activation = Activation.INACTIVE
    private set

  private var lastTap = 0L

  val engaged: Boolean get() = activation != Activation.INACTIVE

  val locked: Boolean get() = activation == Activation.LOCKED

  fun tap() {
    activation = when (activation) {
      Activation.INACTIVE -> Activation.ARMED
      Activation.ARMED ->
        if (now() - lastTap < DOUBLE_TAP_MS) Activation.LOCKED
        else Activation.INACTIVE
      Activation.LOCKED -> Activation.INACTIVE
    }
    lastTap = now()
  }

  /** A key consumed the modifier: armed unlatches, locked persists. */
  fun consume() {
    if (activation == Activation.ARMED) activation = Activation.INACTIVE
  }

  companion object {
    const val DOUBLE_TAP_MS = 300L
  }
}
