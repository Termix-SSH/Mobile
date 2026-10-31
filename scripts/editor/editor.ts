// The file manager's code editor page. Bundled by scripts/build-editor.mjs into
// assets/editor/editor.js.html and run inside a WebView, with no network.

import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { cpp } from "@codemirror/lang-cpp";
import { css } from "@codemirror/lang-css";
import { go } from "@codemirror/lang-go";
import { html } from "@codemirror/lang-html";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { php } from "@codemirror/lang-php";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  StreamLanguage,
  syntaxHighlighting,
  type LanguageSupport,
  type StreamParser,
} from "@codemirror/language";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { nginx } from "@codemirror/legacy-modes/mode/nginx";
import { powerShell } from "@codemirror/legacy-modes/mode/powershell";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import {
  highlightSelectionMatches,
  openSearchPanel,
  search,
  searchKeymap,
} from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

interface Theme {
  background: string;
  foreground: string;
  muted: string;
  border: string;
  accent: string;
  selection: string;
  gutter: string;
  dark: boolean;
}

interface LoadMessage {
  type: "load";
  text: string;
  language: string;
  theme: Theme;
  fontSize: number;
  readOnly: boolean;
  wrap: boolean;
}

type Incoming =
  | LoadMessage
  | { type: "getText" }
  | { type: "search" }
  | { type: "setFontSize"; fontSize: number }
  | { type: "setWrap"; wrap: boolean }
  | { type: "markSaved" };

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (data: string) => void };
    termixEditor?: (message: Incoming) => void;
  }
}

const post = (message: Record<string, unknown>) =>
  window.ReactNativeWebView?.postMessage(JSON.stringify(message));

const legacy = (parser: StreamParser<unknown>) =>
  StreamLanguage.define(parser) as unknown as Extension;

const LANGUAGES: Record<string, () => Extension | LanguageSupport> = {
  javascript: () => javascript({ jsx: true }),
  typescript: () => javascript({ jsx: true, typescript: true }),
  python,
  json,
  html,
  css,
  markdown,
  xml,
  yaml,
  sql,
  rust,
  cpp,
  java,
  php,
  go,
  shell: () => legacy(shell as StreamParser<unknown>),
  dockerfile: () => legacy(dockerFile as StreamParser<unknown>),
  nginx: () => legacy(nginx as StreamParser<unknown>),
  toml: () => legacy(toml as StreamParser<unknown>),
  properties: () => legacy(properties as StreamParser<unknown>),
  lua: () => legacy(lua as StreamParser<unknown>),
  ruby: () => legacy(ruby as StreamParser<unknown>),
  powershell: () => legacy(powerShell as StreamParser<unknown>),
};

function highlightFor(theme: Theme) {
  const c = theme.dark
    ? {
        keyword: "#c678dd",
        string: "#98c379",
        number: "#d19a66",
        comment: "#7f848e",
        fn: "#61afef",
        type: "#e5c07b",
        tag: "#e06c75",
        attr: "#d19a66",
      }
    : {
        keyword: "#a626a4",
        string: "#50a14f",
        number: "#986801",
        comment: "#a0a1a7",
        fn: "#4078f2",
        type: "#c18401",
        tag: "#e45649",
        attr: "#986801",
      };
  return HighlightStyle.define([
    { tag: [t.keyword, t.operatorKeyword, t.modifier], color: c.keyword },
    { tag: [t.string, t.special(t.string), t.regexp], color: c.string },
    { tag: [t.number, t.bool, t.null, t.atom], color: c.number },
    { tag: [t.comment, t.meta], color: c.comment, fontStyle: "italic" },
    {
      tag: [t.function(t.variableName), t.function(t.propertyName)],
      color: c.fn,
    },
    { tag: [t.typeName, t.className, t.namespace], color: c.type },
    { tag: [t.tagName, t.heading], color: c.tag, fontWeight: "bold" },
    { tag: [t.attributeName, t.propertyName], color: c.attr },
    { tag: t.link, color: c.fn, textDecoration: "underline" },
    { tag: t.invalid, color: "#ff5555" },
  ]);
}

function themeFor(theme: Theme, fontSize: number) {
  return EditorView.theme(
    {
      "&": {
        backgroundColor: theme.background,
        color: theme.foreground,
        fontSize: `${fontSize}px`,
        height: "100%",
      },
      ".cm-scroller": {
        fontFamily: "ui-monospace, Menlo, monospace",
        lineHeight: "1.5",
      },
      ".cm-content": { caretColor: theme.accent },
      ".cm-cursor": { borderLeftColor: theme.accent },
      ".cm-gutters": {
        backgroundColor: theme.gutter,
        color: theme.muted,
        borderRight: `1px solid ${theme.border}`,
      },
      ".cm-activeLine": { backgroundColor: `${theme.selection}55` },
      ".cm-activeLineGutter": { backgroundColor: `${theme.selection}55` },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
        backgroundColor: `${theme.selection} !important`,
      },
      ".cm-panels": {
        backgroundColor: theme.gutter,
        color: theme.foreground,
        borderTop: `1px solid ${theme.border}`,
      },
      ".cm-panel input, .cm-panel button": {
        fontSize: "14px",
        borderRadius: "0",
      },
      ".cm-tooltip": {
        backgroundColor: theme.gutter,
        border: `1px solid ${theme.border}`,
      },
    },
    { dark: theme.dark },
  );
}

const look = new Compartment();
const wrapping = new Compartment();
let view: EditorView | null = null;
let savedText = "";
let lastTheme: Theme | null = null;

function load(message: LoadMessage) {
  savedText = message.text;
  lastTheme = message.theme;
  const language = LANGUAGES[message.language]?.() ?? [];
  const state = EditorState.create({
    doc: message.text,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      search({ top: true }),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        indentWithTab,
        {
          key: "Mod-s",
          preventDefault: true,
          run: () => {
            post({ type: "save" });
            return true;
          },
        },
      ]),
      language,
      look.of([
        themeFor(message.theme, message.fontSize),
        syntaxHighlighting(highlightFor(message.theme)),
      ]),
      wrapping.of(message.wrap ? EditorView.lineWrapping : []),
      EditorState.readOnly.of(message.readOnly),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          post({
            type: "change",
            dirty: update.state.doc.toString() !== savedText,
          });
        }
      }),
    ],
  });
  view?.destroy();
  view = new EditorView({ state, parent: document.getElementById("editor")! });
  document.body.style.backgroundColor = message.theme.background;
}

window.termixEditor = (message: Incoming) => {
  switch (message.type) {
    case "load":
      load(message);
      break;
    case "getText":
      post({ type: "text", text: view?.state.doc.toString() ?? "" });
      break;
    case "markSaved":
      savedText = view?.state.doc.toString() ?? savedText;
      post({ type: "change", dirty: false });
      break;
    case "search":
      if (view) openSearchPanel(view);
      break;
    case "setFontSize":
      if (view && lastTheme) {
        view.dispatch({
          effects: look.reconfigure([
            themeFor(lastTheme, message.fontSize),
            syntaxHighlighting(highlightFor(lastTheme)),
          ]),
        });
      }
      break;
    case "setWrap":
      view?.dispatch({
        effects: wrapping.reconfigure(
          message.wrap ? EditorView.lineWrapping : [],
        ),
      });
      break;
  }
};

post({ type: "ready" });
