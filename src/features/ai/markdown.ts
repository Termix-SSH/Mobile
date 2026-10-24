/** Deliberately small Markdown subset: no HTML rendering or resource loading. */
export type InlineNode =
  | { type: "text" | "code"; text: string }
  | { type: "strong" | "emphasis" | "strikethrough"; children: InlineNode[] }
  | { type: "link"; children: InlineNode[]; href: string }
  | { type: "image-alt"; alt: string };

export type BlockNode =
  | { type: "paragraph" | "blockquote"; children: InlineNode[] }
  | { type: "heading"; level: number; children: InlineNode[] }
  | { type: "code"; text: string; lang?: string }
  | { type: "list"; ordered: boolean; start?: number; items: InlineNode[][] }
  | { type: "table"; header: InlineNode[][]; rows: InlineNode[][][] }
  | { type: "horizontal-rule" };

export function safeLinkHref(value: string): string | undefined {
  const href = value.trim();
  if (!/^(?:https?:\/\/|mailto:)\S+$/i.test(href)) return undefined;
  for (let i = 0; i < href.length; i++) {
    if (href.charCodeAt(i) < 33 || href.charCodeAt(i) === 127) return undefined;
  }
  return href;
}

function append(nodes: InlineNode[], node: InlineNode) {
  const last = nodes[nodes.length - 1];
  if (last?.type === "text" && node.type === "text") last.text += node.text;
  else if (node.type !== "text" || node.text) nodes.push(node);
}

export function parseInline(source: string): InlineNode[] {
  // Index matching delimiters once. Failed lookups never rescan the suffix.
  const pairs = new Map<number, number>();
  const ticks = new Map<number, { end: number; length: number }>();
  const runs: { start: number; length: number }[] = [];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\\") i++;
    else if (source[i] === "`") {
      const start = i;
      while (source[i + 1] === "`") i++;
      runs.push({ start, length: i - start + 1 });
    }
  }
  const nextRun = new Map<number, number>();
  for (let i = runs.length - 1; i >= 0; i--) {
    const { start, length } = runs[i];
    const end = nextRun.get(length);
    if (end !== undefined) ticks.set(start, { end, length });
    nextRun.set(length, start);
  }
  const tagEnd = (start: number): number | undefined => {
    if (source[start] !== "<" || !/[a-z/!?]/i.test(source[start + 1] ?? ""))
      return;
    let quote = "";
    for (let i = start + 1; i < source.length; i++) {
      const c = source[i];
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === ">") return i + 1;
    }
    return source.length;
  };
  const brackets: number[] = [],
    parentheses: number[] = [];
  for (let i = 0; i < source.length; i++) {
    const tag = tagEnd(i),
      code = ticks.get(i);
    if (source[i] === "\\") i++;
    else if (tag !== undefined) i = tag - 1;
    else if (code) i = code.end + code.length - 1;
    else if (source[i] === "[") brackets.push(i);
    else if (source[i] === "(") parentheses.push(i);
    else if (source[i] === "]" && brackets.length)
      pairs.set(brackets.pop()!, i);
    else if (source[i] === ")" && parentheses.length)
      pairs.set(parentheses.pop()!, i);
  }
  const whitespace = (c: string | undefined) => !c || /\s/.test(c);
  const word = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
  const parse = (start: number, end: number, depth: number): InlineNode[] => {
    const root: InlineNode[] = [];
    const frames: { marker: string; children: InlineNode[] }[] = [];
    const current = () => frames[frames.length - 1]?.children ?? root;
    const literal = (text: string) => append(current(), { type: "text", text });
    for (let i = start; i < end;) {
      const c = source[i];
      if (
        c === "\\" &&
        i + 1 < end &&
        /[\\`*_[\]{}()#+\-.!>~|]/.test(source[i + 1])
      ) {
        literal(source[i + 1]);
        i += 2;
        continue;
      }
      const tag = tagEnd(i);
      if (tag !== undefined) {
        literal(source.slice(i, Math.min(tag, end)));
        i = Math.min(tag, end);
        continue;
      }
      const code = ticks.get(i);
      if (code && code.end + code.length <= end) {
        append(current(), {
          type: "code",
          text: source.slice(i + code.length, code.end),
        });
        i = code.end + code.length;
        continue;
      }
      if (c === "`") {
        const begin = i++;
        while (i < end && source[i] === "`") i++;
        literal(source.slice(begin, i));
        continue;
      }
      const image = c === "!" && source[i + 1] === "[";
      const opening = image ? i + 1 : i;
      const closing = pairs.get(opening);
      if (
        (image || (c === "[" && depth < 24)) &&
        closing !== undefined &&
        closing < end &&
        source[closing + 1] === "("
      ) {
        const finish = pairs.get(closing + 1);
        // While streaming, suppress an unfinished image destination as well.
        if (image || (finish !== undefined && finish < end)) {
          if (image)
            append(current(), {
              type: "image-alt",
              alt: source
                .slice(opening + 1, closing)
                .replace(/\\([\s\S])/g, "$1"),
            });
          else {
            const children = parse(opening + 1, closing, depth + 1);
            const destination = source.slice(closing + 2, finish).trim();
            const href = safeLinkHref(
              destination.startsWith("<")
                ? destination.slice(1, destination.indexOf(">"))
                : destination.split(/\s/, 1)[0],
            );
            if (href) append(current(), { type: "link", href, children });
            else for (const child of children) append(current(), child);
          }
          i = finish !== undefined && finish < end ? finish + 1 : end;
          continue;
        }
      }
      if (c === "*" || c === "_" || c === "~") {
        const begin = i;
        while (i < end && source[i] === c) i++;
        let count = i - begin;
        const insideWord =
          c === "_" && word(source[begin - 1]) && word(source[i]);
        const canClose = !insideWord && !whitespace(source[begin - 1]);
        const canOpen =
          !insideWord && !whitespace(i < end ? source[i] : undefined);
        while (count > 0) {
          const top = frames[frames.length - 1];
          if (canClose && top?.marker[0] === c && count >= top.marker.length) {
            frames.pop();
            count -= top.marker.length;
            append(current(), {
              type:
                c === "~"
                  ? "strikethrough"
                  : top.marker.length === 2
                    ? "strong"
                    : "emphasis",
              children: top.children,
            });
          } else if (
            canOpen &&
            (c !== "~" || count >= 2) &&
            frames.length < 32
          ) {
            const length = count >= 2 ? 2 : 1;
            frames.push({ marker: c.repeat(length), children: [] });
            count -= length;
          } else {
            literal(c.repeat(count));
            count = 0;
          }
        }
        continue;
      }
      literal(c);
      i++;
    }
    // Unmatched delimiters stay visible. The depth caps also bound AST depth.
    while (frames.length) {
      const frame = frames.pop()!;
      literal(frame.marker);
      for (const child of frame.children) append(current(), child);
    }
    return root;
  };
  return parse(0, source.length, 0);
}

function cells(line: string): string[] {
  const source = line.trim(),
    result: string[] = [];
  let start = 0,
    code = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\\") {
      i++;
      continue;
    }
    if (source[i] === "`") {
      const begin = i;
      while (source[i + 1] === "`") i++;
      const length = i - begin + 1;
      if (!code) code = length;
      else if (code === length) code = 0;
    } else if (source[i] === "|" && !code) {
      result.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  result.push(source.slice(start).trim());
  if (source.startsWith("|")) result.shift();
  if (source.endsWith("|") && result[result.length - 1] === "") result.pop();
  return result;
}

const fence = (line: string) => /^\s*(`{3,}|~{3,})([^`~]*)$/.exec(line);
const heading = (line: string) => /^\s{0,3}(#{1,6})(?:[ \t]+(.*)|$)/.exec(line);
const list = (line: string) =>
  /^\s*(?:([-+*])|([0-9]{1,9})[.)])[ \t]+(.*)$/.exec(line);
const quote = (line: string) => /^\s*>[ \t]?(.*)$/.exec(line);
const rule = (line: string) =>
  /^\s{0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(line);

export function parseMarkdown(source: string): BlockNode[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n"),
    blocks: BlockNode[] = [];
  const table = (i: number) => {
    if (!lines[i]?.includes("|") || i + 1 >= lines.length) return false;
    const header = cells(lines[i]),
      separator = cells(lines[i + 1]);
    return (
      header.length > 0 &&
      header.length === separator.length &&
      separator.every((cell) => /^:?-{3,}:?$/.test(cell))
    );
  };
  const special = (i: number) =>
    fence(lines[i]) ||
    heading(lines[i]) ||
    rule(lines[i]) ||
    list(lines[i]) ||
    quote(lines[i]) ||
    table(i);
  for (let i = 0; i < lines.length;) {
    if (!lines[i].trim()) {
      i++;
      continue;
    }
    const f = fence(lines[i]),
      h = heading(lines[i]),
      item = list(lines[i]),
      q = quote(lines[i]);
    if (f) {
      const content: string[] = [];
      const marker = f[1][0],
        length = f[1].length,
        lang = f[2].trim().split(/\s/, 1)[0];
      i++;
      while (i < lines.length) {
        const closing = lines[i].trim();
        if (
          closing.length >= length &&
          closing[0] === marker &&
          [...closing].every((c) => c === marker)
        ) {
          i++;
          break;
        }
        content.push(lines[i++]);
      }
      blocks.push({
        type: "code",
        text: content.join("\n"),
        ...(lang ? { lang } : {}),
      });
    } else if (h) {
      blocks.push({
        type: "heading",
        level: h[1].length,
        children: parseInline((h[2] ?? "").replace(/[ \t]+#+[ \t]*$/, "")),
      });
      i++;
    } else if (rule(lines[i])) {
      blocks.push({ type: "horizontal-rule" });
      i++;
    } else if (table(i)) {
      const header = cells(lines[i]).map(parseInline),
        rows: InlineNode[][][] = [];
      i += 2;
      while (
        i < lines.length &&
        lines[i].trim() &&
        lines[i].includes("|") &&
        !special(i)
      ) {
        const row = cells(lines[i++]);
        rows.push(header.map((_, column) => parseInline(row[column] ?? "")));
      }
      blocks.push({ type: "table", header, rows });
    } else if (item) {
      const ordered = !!item[2],
        items: InlineNode[][] = [];
      while (i < lines.length) {
        const next = list(lines[i]);
        if (!next || !!next[2] !== ordered || rule(lines[i])) break;
        items.push(parseInline(next[3]));
        i++;
      }
      blocks.push({
        type: "list",
        ordered,
        ...(ordered ? { start: Number(item[2]) } : {}),
        items,
      });
    } else if (q) {
      const content: string[] = [];
      while (i < lines.length) {
        const next = quote(lines[i]);
        if (!next) break;
        content.push(next[1]);
        i++;
      }
      blocks.push({
        type: "blockquote",
        children: parseInline(content.join("\n")),
      });
    } else {
      const content = [lines[i++]];
      while (i < lines.length && lines[i].trim() && !special(i))
        content.push(lines[i++]);
      blocks.push({
        type: "paragraph",
        children: parseInline(content.join("\n")),
      });
    }
  }
  return blocks;
}
