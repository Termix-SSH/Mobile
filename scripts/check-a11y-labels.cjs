#!/usr/bin/env node
// Finds pressables a screen reader can't name: no accessibilityLabel and no
// text inside, like an icon button. Run by npm test; also runs on its own.
// A pressable whose child component draws its own text can opt out with an
// `a11y-reads-children` comment inside it.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const PRESSABLE =
  /^(Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback)$/;
const NAMED = ["accessibilityLabel", "aria-label", "accessible"];

function tsxFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) tsxFiles(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const tagOf = (node) => (node.tagName ? node.tagName.getText() : "");

function hasText(element) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (ts.isJsxText(n)) {
      if (n.text.trim()) found = true;
    } else if (ts.isJsxExpression(n)) {
      const e = n.expression;
      if (!e) return;
      // {label} or {`text`}; elements and conditionals are looked into.
      if (
        ts.isJsxElement(e) ||
        ts.isJsxSelfClosingElement(e) ||
        ts.isConditionalExpression(e) ||
        ts.isBinaryExpression(e) ||
        ts.isParenthesizedExpression(e)
      ) {
        ts.forEachChild(e, visit);
      } else found = true;
    } else if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = ts.isJsxElement(n) ? tagOf(n.openingElement) : tagOf(n);
      if (/(^|\.)Text$|Label$/.test(tag)) found = true;
      else if (ts.isJsxElement(n)) n.children.forEach(visit);
    } else if (!ts.isJsxAttributes(n)) {
      ts.forEachChild(n, visit);
    }
  };
  element.children.forEach(visit);
  return found;
}

/** file:line for every unnamed pressable under the given folders. */
function findUnlabeled(root, dirs = ["src", "app"]) {
  const out = [];
  for (const dir of dirs) {
    for (const file of tsxFiles(path.join(root, dir))) {
      const text = fs.readFileSync(file, "utf8");
      const src = ts.createSourceFile(
        file,
        text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const visit = (n) => {
        if (ts.isJsxElement(n) && PRESSABLE.test(tagOf(n.openingElement))) {
          const attrs = n.openingElement.attributes.properties.map((a) =>
            a.name ? a.name.getText() : "...",
          );
          const named =
            attrs.some((a) => NAMED.includes(a) || a === "...") ||
            n.getText().includes("a11y-reads-children");
          if (!named && !hasText(n)) {
            const { line } = src.getLineAndCharacterOfPosition(n.getStart());
            out.push(
              `${path.relative(root, file).split(path.sep).join("/")}:${line + 1}`,
            );
          }
        }
        ts.forEachChild(n, visit);
      };
      visit(src);
    }
  }
  return out;
}

module.exports = { findUnlabeled };

if (require.main === module) {
  const found = findUnlabeled(path.join(__dirname, ".."));
  for (const where of found) console.log(`${where}: no screen reader label`);
  process.exit(found.length ? 1 : 0);
}
