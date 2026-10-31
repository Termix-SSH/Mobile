# termix-pipe

Native byte pipes between Termix modules. The SSH engine pushes shell output into a pipe by id and the
terminal view reads it on its own thread, so pty bytes never cross the JS bridge.

- `BytePipe`: a queue with a producer and a sink. Above 1 MB queued it pauses the producer (the SSH
  shell reader), below 256 KB it resumes it.
- `TermixPipes.get(id)` and `release(id)`: process wide pipes, so two modules meet without JS.

There is no JS API besides `isPipeAvailable`. Kotlin tests are in `android/src/test`.
