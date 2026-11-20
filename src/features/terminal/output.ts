import { toBase64, utf8Encode } from "@/modules/termix-ssh/src/base64";
import type { ClipboardRequest } from "@/modules/termix-terminal";
import type { ConfirmOptions } from "@/ui/Confirm";
import { t } from "@/i18n";

/**
 * Collects output that comes through JS (the server relay, docker) and hands it to the view once
 * per frame as one base64 write, instead of one bridge call per chunk.
 */
export class OutputBatcher {
  private parts: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly write: (base64: string) => void,
    private readonly delayMs = 16,
  ) {}

  push(text: string) {
    if (!text) return;
    this.parts.push(text);
    if (!this.timer) this.timer = setTimeout(() => this.flush(), this.delayMs);
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.parts.length === 0) return;
    const text = this.parts.join("");
    this.parts = [];
    this.write(toBase64(utf8Encode(text)));
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.parts = [];
  }
}

/** Only web addresses open from the terminal; anything else could launch other apps. */
export function isOpenableLink(url: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(url.trim());
}

export function linkPrompt(url: string): ConfirmOptions {
  return {
    title: t("terminal.output.openLink"),
    description: url,
    confirmLabel: t("terminal.output.open"),
    destructive: false,
  };
}

function lineCount(text: string) {
  return text.split(/\r\n|\r|\n/).length;
}

function preview(text: string) {
  const short = text.length > 300 ? `${text.slice(0, 300)}...` : text;
  return short.trim();
}

export function clipboardPrompt(request: ClipboardRequest): ConfirmOptions {
  switch (request.kind) {
    case "paste": {
      const lines = lineCount(request.text);
      return {
        title:
          lines > 1
            ? t("terminal.output.pasteLines", { lines })
            : t("terminal.output.pasteThisText"),
        description: t("terminal.output.theShellMayRunIt", {
          text: preview(request.text),
        }),
        confirmLabel: t("terminal.output.paste"),
        destructive: false,
      };
    }
    case "read":
      return {
        title: t("terminal.output.letTheProgramReadYour"),
        description: t("terminal.output.itAskedForWhatYou"),
        confirmLabel: t("terminal.output.allow"),
        destructive: false,
      };
    case "write":
      return {
        title: t("terminal.output.letTheProgramCopyTo"),
        description: preview(request.text),
        confirmLabel: t("terminal.output.allow"),
        destructive: false,
      };
  }
}
