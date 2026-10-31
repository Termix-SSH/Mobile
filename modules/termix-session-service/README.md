# termix-session-service

Keeps open sessions going when the app leaves the screen, as far as each OS allows.

- Android: `SessionService`, a foreground service of type `remoteMessaging` with an ongoing notification
  that lists the open sessions and has a Disconnect all button. It only holds the process; the SSH
  engine and sockets keep running on their own. Android 12+ only lets the app start it while it is in
  the foreground, so `src/core/sessions/background.ts` starts it when the first session opens.
  Swiping the app away stops it; the tabs come back on the next launch.
- iOS: no background mode. `beginGrace()` asks for the short finishing time iOS gives any app, so a quick
  app switch keeps sessions open. After that iOS suspends the app and sessions reconnect on return.

The JS side (`index.ts`) is safe to call where the module is missing. Play Console needs the
`remoteMessaging` foreground service type declared under App content.
