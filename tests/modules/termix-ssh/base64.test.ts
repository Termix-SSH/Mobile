import {
  fromBase64,
  toBase64,
  utf8Decode,
  utf8Encode,
} from "@/modules/termix-ssh/src/base64";

describe("termix-ssh base64", () => {
  it("matches Node for every padding length and all byte values", () => {
    const all = new Uint8Array(256).map((_, i) => i);
    for (let n = 0; n <= 10; n++) {
      const bytes = all.subarray(250 - n, 250);
      const expected = Buffer.from(bytes).toString("base64");
      expect(toBase64(bytes)).toBe(expected);
      expect(Array.from(fromBase64(expected))).toEqual(Array.from(bytes));
    }
    expect(toBase64(all)).toBe(Buffer.from(all).toString("base64"));
    expect(Array.from(fromBase64(Buffer.from(all).toString("base64")))).toEqual(
      Array.from(all),
    );
  });

  it("ignores line breaks in input", () => {
    expect(utf8Decode(fromBase64("aGVs\nbG8="))).toBe("hello");
  });

  it("round trips UTF-8 text", () => {
    const text = "héllo ✓ 日本";
    expect(utf8Decode(fromBase64(toBase64(utf8Encode(text))))).toBe(text);
  });
});

describe("termix-ssh base64 without native btoa", () => {
  it("gives the same results on the slow path", () => {
    jest.isolateModules(() => {
      const { btoa: b, atob: a } = globalThis;
      // @ts-expect-error removed for this test
      delete globalThis.btoa;
      // @ts-expect-error removed for this test
      delete globalThis.atob;
      try {
        const slow = require("@/modules/termix-ssh/src/base64");
        const all = new Uint8Array(256).map((_, i) => i);
        const expected = Buffer.from(all).toString("base64");
        expect(slow.toBase64(all)).toBe(expected);
        expect(Array.from(slow.fromBase64(expected))).toEqual(Array.from(all));
        expect(slow.utf8Decode(slow.fromBase64("aGVs\nbG8="))).toBe("hello");
      } finally {
        globalThis.btoa = b;
        globalThis.atob = a;
      }
    });
  });

  it("falls back for input atob refuses", () => {
    expect(utf8Decode(fromBase64("aGVs*bG8="))).toBe("hello");
  });
});
