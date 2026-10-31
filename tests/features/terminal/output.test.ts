import {
  OutputBatcher,
  clipboardPrompt,
  isOpenableLink,
  linkPrompt,
} from "@/features/terminal/output";
import { fromBase64, utf8Decode } from "@/modules/termix-ssh/src/base64";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const decode = (b64: string) => utf8Decode(fromBase64(b64));

describe("OutputBatcher", () => {
  test("joins a frame's output into one base64 write", () => {
    const write = jest.fn();
    const b = new OutputBatcher(write);
    b.push("he");
    b.push("llo ");
    b.push("wörld");
    expect(write).not.toHaveBeenCalled();
    jest.advanceTimersByTime(16);
    expect(write).toHaveBeenCalledTimes(1);
    expect(decode(write.mock.calls[0][0])).toBe("hello wörld");
  });

  test("flush sends at once and empty output sends nothing", () => {
    const write = jest.fn();
    const b = new OutputBatcher(write);
    b.push("");
    b.flush();
    expect(write).not.toHaveBeenCalled();
    b.push("x");
    b.flush();
    expect(write).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(50);
    expect(write).toHaveBeenCalledTimes(1);
  });

  test("dispose drops what is waiting", () => {
    const write = jest.fn();
    const b = new OutputBatcher(write);
    b.push("x");
    b.dispose();
    jest.advanceTimersByTime(50);
    expect(write).not.toHaveBeenCalled();
  });
});

test("only web links open", () => {
  expect(isOpenableLink("https://termix.site/docs")).toBe(true);
  expect(isOpenableLink("http://10.0.0.1:8080")).toBe(true);
  expect(isOpenableLink("file:///etc/passwd")).toBe(false);
  expect(isOpenableLink("javascript:alert(1)")).toBe(false);
  expect(isOpenableLink("termix-mobile://oidc-callback")).toBe(false);
  expect(isOpenableLink("https://a b")).toBe(false);
});

test("the link prompt shows the address", () => {
  expect(linkPrompt("https://x.y")).toMatchObject({
    description: "https://x.y",
    destructive: false,
  });
});

describe("clipboardPrompt", () => {
  test("counts pasted lines", () => {
    expect(
      clipboardPrompt({ id: 1, kind: "paste", text: "a\nb\r\nc" }).title,
    ).toBe("Paste 3 lines?");
    expect(
      clipboardPrompt({ id: 1, kind: "paste", text: "rm -rf" }).title,
    ).toBe("Paste this text?");
  });

  test("shortens long text", () => {
    const text = "x".repeat(1000);
    const description = clipboardPrompt({ id: 1, kind: "write", text })
      .description as string;
    expect(description.length).toBeLessThan(320);
  });

  test("asks before a program reads the clipboard", () => {
    expect(clipboardPrompt({ id: 1, kind: "read", text: "" }).title).toBe(
      "Let the program read your clipboard?",
    );
  });
});
