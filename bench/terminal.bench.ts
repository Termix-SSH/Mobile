import {
  fromBase64,
  toBase64,
  utf8Encode,
} from "@/modules/termix-ssh/src/base64";
import { OutputBatcher } from "@/features/terminal/output";
import { PromptWatcher } from "@/features/terminal/password-prompt";
import { bench } from "./bench";

// A colored log line, like `journalctl -f` or a build.
const LINE =
  "\x1b[32m2026-10-25 12:00:00\x1b[0m \x1b[1mINFO\x1b[0m worker 7: request done in 12 ms path=/api/hosts\r\n";
// What a relay socket sends: about 4 KB per message, 10 MB in all.
const CHUNK = LINE.repeat(Math.ceil(4096 / LINE.length));
const MESSAGES = Math.ceil((10 * 1024 * 1024) / CHUNK.length);
const wire = JSON.stringify({ type: "data", data: CHUNK });
const chunkBase64 = toBase64(utf8Encode(CHUNK));

test("terminal stream, 10 MB of log", () => {
  const watcher = new PromptWatcher({
    settings: () => ({ passwordPromptAutoFill: true }),
    canFill: () => true,
    lastCommand: () => "",
    offer: () => {},
  });
  // Relay path: parse, prompt watch, then batch into one base64 write per frame.
  bench(
    "terminal: relay 10 MB through JS",
    () => {
      const batcher = new OutputBatcher(() => {}, 1e9);
      for (let i = 0; i < MESSAGES; i++) {
        const msg = JSON.parse(wire);
        watcher.feed(msg.data);
        batcher.push(msg.data);
        // A frame holds about 16 messages on a fast stream.
        if (i % 16 === 15) batcher.flush();
      }
      batcher.flush();
      batcher.dispose();
    },
    5,
  );
  bench(
    "terminal: prompt watch 10 MB",
    () => {
      for (let i = 0; i < MESSAGES; i++) watcher.feed(CHUNK);
    },
    5,
  );
  bench(
    "terminal: base64 decode 10 MB",
    () => {
      for (let i = 0; i < MESSAGES; i++) fromBase64(chunkBase64);
    },
    5,
  );
  const bytes = utf8Encode(CHUNK);
  bench(
    "terminal: base64 encode 10 MB",
    () => {
      for (let i = 0; i < MESSAGES; i++) toBase64(bytes);
    },
    5,
  );
});
