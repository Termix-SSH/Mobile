import { performance } from "node:perf_hooks";
import {
  parseInline,
  parseMarkdown,
  safeLinkHref,
} from "@/features/ai/markdown";

const text = (value: string) => ({ type: "text", text: value });

test("parses empty input, paragraphs, and soft line breaks", () => {
  expect(parseMarkdown("")).toEqual([]);
  expect(parseMarkdown("\n \n\t\n")).toEqual([]);
  expect(parseMarkdown("First line\nsecond line\n\nNext paragraph.")).toEqual([
    {
      type: "paragraph",
      children: [text("First line\nsecond line")],
    },
    { type: "paragraph", children: [text("Next paragraph.")] },
  ]);
});

test.each([1, 2, 3, 4, 5, 6])("parses level %i headings", (level) => {
  expect(parseMarkdown(`${"#".repeat(level)} Heading **bold**`)).toEqual([
    {
      type: "heading",
      level,
      children: [
        text("Heading "),
        { type: "strong", children: [text("bold")] },
      ],
    },
  ]);
});

test("does not treat hashes inside normal text as headings", () => {
  for (const source of ["#hashtag", "####### Too deep", "text # heading"]) {
    expect(parseMarkdown(source)).toEqual([
      { type: "paragraph", children: [text(source)] },
    ]);
  }
});

test("preserves fenced code literally and records an optional language", () => {
  expect(
    parseMarkdown("```ts\nconst x = '**literal**';\n<b>literal</b>\n```"),
  ).toEqual([
    {
      type: "code",
      lang: "ts",
      text: "const x = '**literal**';\n<b>literal</b>",
    },
  ]);
  expect(parseMarkdown("~~~\nline one\nline two\n~~~")).toEqual([
    { type: "code", text: "line one\nline two" },
  ]);
});

test("renders an unterminated fence as code through the end of the message", () => {
  expect(
    parseMarkdown("Before\n\n```sh\nprintf '**hello**'\nnext line"),
  ).toEqual([
    { type: "paragraph", children: [text("Before")] },
    { type: "code", lang: "sh", text: "printf '**hello**'\nnext line" },
  ]);
  expect(parseMarkdown("```\n")).toEqual([{ type: "code", text: "" }]);
});

test("parses unordered and ordered lists with inline content", () => {
  expect(parseMarkdown("- first **item**\n- second item")).toEqual([
    {
      type: "list",
      ordered: false,
      items: [
        [text("first "), { type: "strong", children: [text("item")] }],
        [text("second item")],
      ],
    },
  ]);
  expect(parseMarkdown("3. third\n4. fourth")).toEqual([
    {
      type: "list",
      ordered: true,
      start: 3,
      items: [[text("third")], [text("fourth")]],
    },
  ]);
});

test("parses blockquotes and horizontal rules", () => {
  expect(parseMarkdown("> A **quote**\n> continues")).toEqual([
    {
      type: "blockquote",
      children: [
        text("A "),
        { type: "strong", children: [text("quote")] },
        text("\ncontinues"),
      ],
    },
  ]);
  for (const marker of ["---", "***", "___"]) {
    expect(parseMarkdown(marker)).toEqual([{ type: "horizontal-rule" }]);
  }
});

test("parses a formatted example with bold, two bullets, and a 2x2 table", () => {
  const source = [
    "**bold text**",
    "",
    "- first item",
    "- second item",
    "",
    "| A | B |",
    "| --- | --- |",
    "| one | two |",
    "| three | four |",
  ].join("\n");
  expect(parseMarkdown(source)).toEqual([
    {
      type: "paragraph",
      children: [{ type: "strong", children: [text("bold text")] }],
    },
    {
      type: "list",
      ordered: false,
      items: [[text("first item")], [text("second item")]],
    },
    {
      type: "table",
      header: [[text("A")], [text("B")]],
      rows: [
        [[text("one")], [text("two")]],
        [[text("three")], [text("four")]],
      ],
    },
  ]);
});

test("requires a delimiter row to recognize a table", () => {
  expect(parseMarkdown("left | right\nplain | text")).toEqual([
    {
      type: "paragraph",
      children: [text("left | right\nplain | text")],
    },
  ]);
});

test("parses inline strong, emphasis, strikethrough, and nesting", () => {
  expect(parseInline("**bold** *italic* ~~deleted~~")).toEqual([
    { type: "strong", children: [text("bold")] },
    text(" "),
    { type: "emphasis", children: [text("italic")] },
    text(" "),
    { type: "strikethrough", children: [text("deleted")] },
  ]);
  expect(parseInline("**bold and *italic***")).toEqual([
    {
      type: "strong",
      children: [
        text("bold and "),
        { type: "emphasis", children: [text("italic")] },
      ],
    },
  ]);
});

test("supports underscore emphasis while preserving snake_case identifiers", () => {
  expect(parseInline("_italic_ __bold__")).toEqual([
    { type: "emphasis", children: [text("italic")] },
    text(" "),
    { type: "strong", children: [text("bold")] },
  ]);
  expect(parseInline("snake_case another_long_identifier")).toEqual([
    text("snake_case another_long_identifier"),
  ]);
});

test("keeps inline code opaque and handles escaped formatting punctuation", () => {
  expect(parseInline("`**literal** <b>x</b>`")).toEqual([
    { type: "code", text: "**literal** <b>x</b>" },
  ]);
  expect(parseInline("``a ` b``")).toEqual([{ type: "code", text: "a ` b" }]);
  expect(parseInline("\\*literal\\* and \\[label\\]")).toEqual([
    text("*literal* and [label]"),
  ]);
});

test.each(["unfinished *italic", "unfinished **bold", "unfinished `code"])(
  "keeps unmatched inline delimiters literal: %s",
  (source) => {
    expect(parseInline(source)).toEqual([text(source)]);
  },
);

test.each([
  "http://example.com/path?q=1#anchor",
  "https://example.com/path",
  "mailto:hello@example.com",
])("permits the supported link destination %s", (href) => {
  expect(safeLinkHref(href)).toBe(href);
  expect(parseInline(`[**label**](${href})`)).toEqual([
    {
      type: "link",
      href,
      children: [{ type: "strong", children: [text("label")] }],
    },
  ]);
});

test.each([
  "javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "file:///etc/passwd",
  "//example.com/path",
  "/relative/path",
  "tel:+123456789",
  "java\nscript:alert(1)",
  "\u0000javascript:alert(1)",
])("rejects unsupported or obfuscated link destinations: %j", (href) => {
  expect(safeLinkHref(href)).toBeUndefined();
});

test("drops unsafe link destinations while retaining their readable label", () => {
  expect(parseInline("[**click here**](javascript:alert(1))")).toEqual([
    { type: "strong", children: [text("click here")] },
  ]);
});

test("represents images only as alt text without retaining their destination", () => {
  const source = "Before ![test](https://example.com/test.png) after";
  const parsed = parseInline(source);
  expect(parsed).toEqual([
    text("Before "),
    { type: "image-alt", alt: "test" },
    text(" after"),
  ]);
  expect(JSON.stringify(parsed)).not.toContain("https://example.com/test.png");
});

test.each([
  '![test](https://example.com/test.png "image title")',
  "![test](https://example.com/a_(b).png)",
])("discards the full image destination and optional title: %s", (source) => {
  expect(parseInline(source)).toEqual([{ type: "image-alt", alt: "test" }]);
});

test("keeps image alt text inside a safe link without retaining the image URL", () => {
  const parsed = parseInline(
    "[![test](https://example.com/image.png)](https://example.com/page)",
  );
  expect(parsed).toEqual([
    {
      type: "link",
      href: "https://example.com/page",
      children: [{ type: "image-alt", alt: "test" }],
    },
  ]);
  expect(JSON.stringify(parsed)).not.toContain("https://example.com/image.png");
});

test("keeps raw HTML as literal text", () => {
  const source = "<b>html</b> <script>alert(1)</script>";
  expect(parseInline(source)).toEqual([text(source)]);
  expect(parseMarkdown(source)).toEqual([
    { type: "paragraph", children: [text(source)] },
  ]);
});

test("keeps Markdown punctuation inside raw HTML attributes literal", () => {
  const source = '<img alt="**x**" src="https://example.com/image.png">';
  expect(parseInline(source)).toEqual([text(source)]);
  expect(parseMarkdown(source)).toEqual([
    { type: "paragraph", children: [text(source)] },
  ]);
});

test("handles the exact web prompt without retaining an image URL or parsing HTML", () => {
  const source =
    "**bold text**, a bulleted list with two items, a small 2x2 table, ![test](https://example.com/test.png) and <b>html</b>";
  const parsed = parseMarkdown(source);
  expect(parsed).toEqual([
    {
      type: "paragraph",
      children: [
        { type: "strong", children: [text("bold text")] },
        text(", a bulleted list with two items, a small 2x2 table, "),
        { type: "image-alt", alt: "test" },
        text(" and <b>html</b>"),
      ],
    },
  ]);
  expect(JSON.stringify(parsed)).not.toContain("https://example.com/test.png");
});

test("parses deterministic random Unicode and malformed Markdown without throwing", () => {
  const alphabet = [
    "a",
    " ",
    "\n",
    "\r",
    "*",
    "_",
    "~",
    "`",
    "[",
    "]",
    "(",
    ")",
    "!",
    "\\",
    "|",
    "#",
    ">",
    "<",
    "-",
    ":",
    "\u0000",
    "é",
    "\u0301",
    "中",
    "🙂",
    "\ud800",
  ];
  let seed = 0x5eed;
  const random = () => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return seed;
  };
  for (let sample = 0; sample < 80; sample += 1) {
    const length = random() % 200;
    let source = "";
    for (let index = 0; index < length; index += 1) {
      source += alphabet[random() % alphabet.length];
    }
    const blocks = parseMarkdown(source);
    const inline = parseInline(source);
    expect(Array.isArray(blocks)).toBe(true);
    expect(Array.isArray(inline)).toBe(true);
    expect(parseMarkdown(source)).toEqual(blocks);
    expect(parseInline(source)).toEqual(inline);
    expect(() => JSON.stringify({ blocks, inline })).not.toThrow();
  }
});

test("bounds deeply nested input so its result remains serializable", () => {
  const source =
    "[label ".repeat(1_500) + "center" + "](https://example.com)".repeat(1_500);
  const blocks = parseMarkdown(source);
  const inline = parseInline(source);
  let serialized = "";
  expect(() => {
    serialized = JSON.stringify({ blocks, inline });
  }).not.toThrow();
  expect(serialized.length).toBeLessThan(source.length * 20);
});

test.each([
  { name: "unclosed links", source: "[".repeat(20_000) },
  { name: "unclosed images", source: "![".repeat(10_000) },
  { name: "alternating delimiters", source: "*_".repeat(10_000) },
  { name: "code delimiters", source: "`".repeat(20_000) },
  { name: "unclosed HTML tags", source: "<".repeat(20_000) },
])("parses 20k adversarial $name within 200ms", ({ source }) => {
  // Warm the entry points before measuring parser work with a monotonic clock.
  parseMarkdown("warmup");
  parseInline("warmup");
  const started = performance.now();
  const blocks = parseMarkdown(source);
  const inline = parseInline(source);
  const elapsed = performance.now() - started;
  expect(Array.isArray(blocks)).toBe(true);
  expect(Array.isArray(inline)).toBe(true);
  expect(elapsed).toBeLessThan(200);
});
