// Byte streams the terminal lab feeds into each engine. Everything here is
// plain text with escape sequences, so the same fixture can go to any engine
// and to the host benchmarks.

const ESC = "\x1b";
const CSI = `${ESC}[`;

export function truecolorRamp(width = 72): string {
  let out = "";
  for (let i = 0; i < width; i++) {
    const r = Math.round((255 * i) / (width - 1));
    const g = Math.round(255 - r);
    const b = Math.round((128 + 127 * Math.sin(i / 6)) % 256);
    out += `${CSI}48;2;${r};${g};${b}m `;
  }
  return `${out}${CSI}0m\r\n`;
}

export function palette256(): string {
  let out = "";
  for (let i = 0; i < 256; i++) {
    out += `${CSI}48;5;${i}m${String(i).padStart(4)}`;
    if (i % 16 === 15) out += `${CSI}0m\r\n`;
  }
  return out;
}

export function sgrStyles(): string {
  const styles: [string, string][] = [
    ["1", "bold"],
    ["3", "italic"],
    ["4", "underline"],
    ["1;3", "bold italic"],
    ["4:3", "curly"],
    ["2", "faint"],
    ["7", "inverse"],
    ["9", "strike"],
    ["1;4;38;2;255;140;0", "bold underline orange"],
  ];
  return (
    styles.map(([code, label]) => `${CSI}${code}m${label}${CSI}0m`).join("  ") +
    "\r\n"
  );
}

export const WIDE_SAMPLES = [
  "CJK: 日本語のテキスト 中文字符 한국어",
  "Emoji: 😀 👍🏽 🇯🇵 👩‍💻 ❤️ ✅",
  "Nerd: " +
    [0xe0b0, 0xe0b2, 0xf113, 0xe606, 0xf07c, 0xf0e7, 0xf0219]
      .map((c) => String.fromCodePoint(c))
      .join(" "),
  "Box: ┌──┬──┐ │ab│cd│ └──┴──┘",
];

export function testPattern(): string {
  return [
    `${CSI}2J${CSI}H${CSI}1mTermix terminal lab${CSI}0m\r\n\r\n`,
    "Truecolor\r\n",
    truecolorRamp(),
    "\r\n256 colors\r\n",
    palette256(),
    "\r\nStyles\r\n",
    sgrStyles(),
    "\r\n",
    WIDE_SAMPLES.join("\r\n"),
    "\r\n\r\n",
  ].join("");
}

/** `yes` output, sized to roughly `bytes`. */
export function yesChunk(bytes: number): string {
  return "y\n".repeat(Math.max(1, Math.floor(bytes / 2)));
}

const LEVELS = [
  [`${CSI}32m`, "INFO "],
  [`${CSI}33m`, "WARN "],
  [`${CSI}31m`, "ERROR"],
  [`${CSI}36m`, "DEBUG"],
] as const;

/** One colored log line. Deterministic for a given index. */
export function logLine(i: number): string {
  const [color, level] = LEVELS[(i * 7) % LEVELS.length];
  const ms = String(i % 1000).padStart(3, "0");
  const sec = String(Math.floor(i / 1000) % 60).padStart(2, "0");
  return (
    `${CSI}90m2026-10-23T14:${sec}:00.${ms}Z${CSI}0m ${color}${level}${CSI}0m ` +
    `[worker-${i % 16}] request id=${(i * 2654435761) >>> 0} path=/api/v1/hosts/${i % 97} ` +
    `status=${i % 11 === 0 ? 500 : 200} took=${(i % 250) + 1}ms\r\n`
  );
}

/** Log text split into chunks of about `chunkBytes`, `total` bytes in all. */
export function* logChunks(
  total: number,
  chunkBytes: number,
): Generator<string> {
  let sent = 0;
  let i = 0;
  while (sent < total) {
    let chunk = "";
    while (chunk.length < chunkBytes) chunk += logLine(i++);
    sent += chunk.length;
    yield chunk;
  }
}

export const ALT_SCREEN_ON = `${CSI}?1049h${CSI}H${CSI}2J`;
export const ALT_SCREEN_OFF = `${CSI}?1049l`;
// Button events plus SGR encoding, what htop and vim ask for.
export const MOUSE_ON = `${CSI}?1002h${CSI}?1006h`;
export const MOUSE_OFF = `${CSI}?1002l${CSI}?1006l`;

/** A full screen TUI frame for the alt screen demo. */
export function altScreenFrame(cols: number, rows: number, tick: number) {
  let out = `${CSI}H`;
  const title = ` lab top | tick ${tick} `;
  out += `${CSI}7m${title.padEnd(cols)}${CSI}0m`;
  for (let r = 1; r < rows - 1; r++) {
    const pct = (r * 37 + tick * 5) % 100;
    const bar = "█".repeat(Math.floor(((cols - 20) * pct) / 100));
    out += `${CSI}${r + 1};1H${CSI}K cpu${String(r).padStart(2)} ${CSI}32m${bar}${CSI}0m ${pct}%`;
  }
  out += `${CSI}${rows};1H${CSI}7m${" q quit | tap to send mouse ".padEnd(cols)}${CSI}0m`;
  return out;
}

/** Turns an SGR mouse report into a readable line, or null. */
export function describeMouseReport(input: string): string | null {
  const m = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/.exec(input);
  if (!m) return null;
  const code = Number(m[1]);
  const button = code & 64 ? (code & 1 ? "wheel down" : "wheel up") : code & 3;
  const kind = m[4] === "M" ? (code & 32 ? "drag" : "press") : "release";
  return `mouse ${kind} button=${button} col=${m[2]} row=${m[3]}`;
}
