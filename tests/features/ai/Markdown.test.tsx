import {
  act,
  fireEvent,
  render,
  waitFor,
  type RenderResult,
} from "@testing-library/react-native";
import { Linking, StyleSheet } from "react-native";
import { MONO_FONT, MONO_FONT_BOLD } from "@/constants/fonts";
import { Markdown } from "@/features/ai/Markdown";
import type { ConfirmOptions } from "@/ui/Confirm";
import { toast } from "@/utils/toast";

const mockConfirm = jest.fn<Promise<boolean>, [ConfirmOptions]>();

jest.mock("@/ui/Confirm", () => ({
  useConfirm: () => mockConfirm,
}));

jest.mock("@/utils/toast", () => ({
  toast: { error: jest.fn() },
}));

const mockOpenURL = jest.spyOn(Linking, "openURL");
type RenderedNode = ReturnType<RenderResult["getByText"]>;

function scrollAncestor(node: RenderedNode) {
  let parent = node.parent;
  while (parent && !parent.props.horizontal) parent = parent.parent;
  return parent;
}

beforeEach(() => {
  mockConfirm.mockReset().mockResolvedValue(false);
  mockOpenURL.mockReset().mockResolvedValue(undefined);
  jest.mocked(toast.error).mockClear();
});

test.each([false, true])(
  "renders the regression prompt safely with muted=%s",
  async (muted) => {
    const source =
      "**bold text**, a bulleted list with two items, a small 2x2 table, ![test](https://example.com/test.png) and <b>html</b>";
    const result = await render(<Markdown source={source} muted={muted} />);

    const strong = result.getByText("bold text");
    expect(StyleSheet.flatten(strong.props.style).fontFamily).toBe(
      MONO_FONT_BOLD,
    );
    expect(strong.props.selectable).toBe(true);
    expect(strong.props.className).toContain(
      muted ? "text-muted-foreground" : "text-foreground",
    );
    expect(result.getByText(/<b>html<\/b>/)).toBeTruthy();
    expect(result.getByText(/test and/)).toBeTruthy();

    const tree = JSON.stringify(result.toJSON());
    expect(tree).not.toContain("example.com/test.png");
    expect(
      result.container.queryAll((node) => /image/i.test(node.type)),
    ).toHaveLength(0);
    for (const text of result.container.queryAll((node) =>
      /^(Text|RCTText)$/.test(node.type),
    )) {
      expect(text.props.selectable).toBe(true);
    }
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockOpenURL).not.toHaveBeenCalled();
  },
);

test("an unfinished streaming image never exposes its destination", async () => {
  const result = await render(
    <Markdown source="![test](https://example.com/test.png" />,
  );
  expect(JSON.stringify(result.toJSON())).not.toContain("example.com/test.png");
  expect(
    result.container.queryAll((node) => /image/i.test(node.type)),
  ).toHaveLength(0);
  expect(result.queryAllByRole("link")).toHaveLength(0);
});

test("renders headings, list items, and a bordered table with bold headers", async () => {
  const source = [
    "# Heading",
    "",
    "- first item",
    "- second item",
    "",
    "| Left | Right |",
    "| --- | --- |",
    "| a | b |",
    "| c | d |",
  ].join("\n");
  const result = await render(<Markdown source={source} />);

  expect(result.getByRole("header").props.selectable).toBe(true);
  expect(result.getByText("first item")).toBeTruthy();
  expect(result.getByText("second item")).toBeTruthy();
  expect(result.getAllByText("•")).toHaveLength(2);

  for (const label of ["Left", "Right"]) {
    const header = result.getByText(label);
    expect(StyleSheet.flatten(header.props.style).fontFamily).toBe(
      MONO_FONT_BOLD,
    );
    expect(header.props.selectable).toBe(true);
    expect(scrollAncestor(header)?.props.horizontal).toBe(true);
  }
  for (const label of ["Left", "Right", "a", "b", "c", "d"]) {
    const cell = result.getByText(label);
    expect(cell.parent?.props.className).toContain("border border-border");
  }
  expect(StyleSheet.flatten(result.getByText("a").props.style).fontFamily).toBe(
    MONO_FONT,
  );
});

test.each([false, true])(
  "keeps fenced code selectable, monospace, and horizontally scrollable with muted=%s",
  async (muted) => {
    const code =
      'printf "a deliberately long command that must keep its spacing"';
    const result = await render(
      <Markdown source={`\`\`\`sh\n${code}\n\`\`\``} muted={muted} />,
    );
    const text = result.getByText(code);
    expect(text.props.selectable).toBe(true);
    expect(StyleSheet.flatten(text.props.style).fontFamily).toBe(MONO_FONT);
    expect(scrollAncestor(text)?.props.horizontal).toBe(true);
  },
);

test.each([
  "https://example.com/docs",
  "http://example.com/docs",
  "mailto:help@example.com",
])("opens %s only after explicit confirmation", async (href) => {
  let settle!: (answer: boolean) => void;
  mockConfirm.mockReturnValueOnce(
    new Promise<boolean>((resolve) => {
      settle = resolve;
    }),
  );
  const result = await render(<Markdown source={`[Documentation](${href})`} />);
  expect(mockConfirm).not.toHaveBeenCalled();
  expect(mockOpenURL).not.toHaveBeenCalled();

  const link = result.getByRole("link");
  expect(link.props.selectable).toBe(true);
  await fireEvent.press(link);

  expect(mockConfirm).toHaveBeenCalledWith(
    expect.objectContaining({
      title: "Open link?",
      confirmLabel: "Open",
      destructive: false,
      description: expect.objectContaining({
        props: expect.objectContaining({ selectable: true, children: href }),
      }),
    }),
  );
  expect(mockOpenURL).not.toHaveBeenCalled();

  await act(async () => settle(true));
  expect(mockOpenURL).toHaveBeenCalledTimes(1);
  expect(mockOpenURL).toHaveBeenCalledWith(href);
});

test("cancelling link confirmation never opens a native URL", async () => {
  const result = await render(
    <Markdown source="[Documentation](https://example.com/docs)" muted />,
  );
  await fireEvent.press(result.getByRole("link"));

  expect(mockConfirm).toHaveBeenCalledTimes(1);
  expect(mockOpenURL).not.toHaveBeenCalled();
});

test.each([
  ["\u202E", "\\u202E"],
  ["\u200B", "\\u200B"],
])(
  "link confirmation reveals invisible character %j",
  async (character, escaped) => {
    const href = `https://example.com/safe${character}hidden`;
    mockConfirm.mockResolvedValueOnce(true);
    const result = await render(
      <Markdown source={`[Documentation](${href})`} />,
    );

    await fireEvent.press(result.getByRole("link"));

    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Open link?",
        description: expect.objectContaining({
          props: expect.objectContaining({
            children: `https://example.com/safe${escaped}hidden`,
          }),
        }),
      }),
    );
    expect(mockOpenURL).toHaveBeenCalledWith(href);
  },
);

test("unsafe destinations never become interactive links", async () => {
  const result = await render(
    <Markdown
      source={[
        "[script](javascript:alert(1))",
        "[data](data:text/plain,hello)",
        "[file](file:///private.txt)",
        "[relative](//example.com/path)",
      ].join(" ")}
    />,
  );

  expect(result.queryAllByRole("link")).toHaveLength(0);
  expect(mockConfirm).not.toHaveBeenCalled();
  expect(mockOpenURL).not.toHaveBeenCalled();
});

test("a native open failure reports an error without rejecting the press", async () => {
  mockConfirm.mockResolvedValueOnce(true);
  mockOpenURL.mockRejectedValueOnce(new Error("No URL handler"));
  const result = await render(
    <Markdown source="[Documentation](https://example.com/docs)" />,
  );

  await fireEvent.press(result.getByRole("link"));

  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith("Could not open link"),
  );
});
