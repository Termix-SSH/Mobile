// The modules a plugin bundle leaves as bare imports, served from the page's
// own copies through an import map of blob URLs.

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const RESERVED = new Set([
  "default",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "let",
  "static",
]);

export const SHARED_GLOBAL = "__termixShared";

/** ES module source that re-exports one shared module by name. */
export function shimSource(specifier: string, module: object): string {
  const names = Object.keys(module).filter(
    (name) =>
      IDENTIFIER.test(name) && !RESERVED.has(name) && name !== "__termixModule",
  );
  const ref = `globalThis.${SHARED_GLOBAL}[${JSON.stringify(specifier)}]`;
  const lines = [`const __termixModule = ${ref};`];
  if (names.length)
    lines.push(`export const { ${names.join(", ")} } = __termixModule;`);
  lines.push(
    `export default ("default" in __termixModule ? __termixModule.default : __termixModule);`,
  );
  return lines.join("\n");
}

/** Puts the shared modules on the page and an import map that points at them. */
export function installImportMap(
  shared: Record<string, object>,
  toUrl: (source: string) => string,
): Record<string, string> {
  (globalThis as Record<string, unknown>)[SHARED_GLOBAL] = shared;
  const imports: Record<string, string> = {};
  for (const [specifier, module] of Object.entries(shared)) {
    imports[specifier] = toUrl(shimSource(specifier, module));
  }
  const script = document.createElement("script");
  script.type = "importmap";
  script.textContent = JSON.stringify({ imports });
  document.head.appendChild(script);
  return imports;
}

/** True for the error a browser throws when a bundle imports a name we lack. */
export function isLinkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return error instanceof SyntaxError && /export|provide|import/i.test(message);
}
