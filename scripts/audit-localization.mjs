import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";

const root = resolve(process.cwd());
const sourceDirectories = ["app", "components", "lib"];
const translatableAttributes = new Set(["alt", "aria-label", "description", "detail", "eloLabel", "label", "loadingLabel", "message", "placeholder", "playsLabel", "subtitle", "text", "title"]);
const translatableProperties = /^(?:ariaLabel|body|caption|cta|desc|description|detail|empty(?:Label|Message|Text)?|heading|label|message|placeholder|subtitle|title|tooltip)$/i;
const translatablePropertySuffix = /(?:Caption|Description|Detail|Label|Message|Subtitle|Text|Title|Tooltip)$/;
const findings = [];
const findingPositions = new Set();

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return filesIn(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

function addFinding(source, node, text, kind) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!/[A-Za-z]/.test(normalized) || /^(?:https?:|mailto:|[^\s@]+@[^\s@]+\.[^\s@]+$)/i.test(normalized)) return;
  const identity = `${source.fileName}:${node.getStart(source)}:${kind}`;
  if (findingPositions.has(identity)) return;
  findingPositions.add(identity);
  const position = source.getLineAndCharacterOfPosition(node.getStart(source));
  findings.push({
    file: source.fileName.replaceAll("\\", "/").replace(`${root.replaceAll("\\", "/")}/`, ""),
    line: position.line + 1,
    kind,
    text: normalized,
  });
}

function isTranslationKeyArgument(node) {
  let current = node;
  while (current?.parent && !ts.isJsxExpression(current.parent) && !ts.isPropertyAssignment(current.parent)) {
    if (ts.isCallExpression(current.parent)
      && ts.isIdentifier(current.parent.expression)
      && ["t", "translate"].includes(current.parent.expression.text)
      && current.parent.arguments[0] === current) return true;
    current = current.parent;
  }
  return false;
}

// A template literal is fully localized when every interpolation is a t()/translate()
// call and there is no non-whitespace literal text (head or span tails). Such a label
// carries no hardcoded UI text, so it must not be flagged.
function isFullyLocalizedTemplate(node) {
  if (!ts.isTemplateExpression(node)) return false;
  if (node.head.text.trim() !== "") return false;
  const spans = node.templateSpans;
  if (spans.length === 0) return false;
  for (const span of spans) {
    const expr = span.expression;
    if (!(ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && ["t", "translate"].includes(expr.expression.text))) return false;
    if (span.literal.text.trim() !== "") return false;
  }
  return true;
}

function containingJsxExpression(node) {
  let current = node.parent;
  while (current) {
    if (ts.isJsxExpression(current)) return current;
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current) || ts.isSourceFile(current)) return null;
    current = current.parent;
  }
  return null;
}

function ancestorBefore(node, stop, predicate) {
  let current = node.parent;
  while (current && current !== stop) {
    if (predicate(current)) return current;
    current = current.parent;
  }
  return null;
}

function componentNameForAttribute(node) {
  const owner = node.parent?.parent;
  if (!owner || (!ts.isJsxOpeningElement(owner) && !ts.isJsxSelfClosingElement(owner))) return "";
  return owner.tagName.getText();
}

function isInternalControlAttribute(node) {
  return node.name.text === "label" && componentNameForAttribute(node) === "DimensionBars";
}

function isTranslatableAttribute(node) {
  return translatableAttributes.has(node.name.text) || translatableProperties.test(node.name.text) || translatablePropertySuffix.test(node.name.text);
}

function isTranslatablePropertyName(name) {
  return translatableProperties.test(name) || translatablePropertySuffix.test(name);
}

function isCssValue(text) {
  return /^(?:oklch|rgb|hsl|var)\(/i.test(text.trim());
}

function isProgramControlLiteral(node, expression) {
  return Boolean(ancestorBefore(node, expression, (ancestor) => (
    ts.isBinaryExpression(ancestor)
    || ts.isCaseClause(ancestor)
  )));
}

function uiMessageArgument(node, isClient, auditClientErrors) {
  if (ts.isCallExpression(node)) {
    if (ts.isIdentifier(node.expression)
      && ["alert", "confirm", "setError", "setMessage", "setNotice", "setSuccess"].includes(node.expression.text)) {
      return node.arguments[0];
    }
    if (ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === "window"
      && ["alert", "confirm"].includes(node.expression.name.text)) {
      return node.arguments[0];
    }
  }
  if (isClient && auditClientErrors && ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Error") {
    return node.arguments?.[0];
  }
  return null;
}

function literalText(node, source) {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.getText(source).slice(1, -1).replace(/\$\{[^}]+\}/g, "{value}");
  return null;
}

for (const directory of sourceDirectories) {
  for (const file of await filesIn(resolve(root, directory))) {
    const input = await readFile(file, "utf8");
    const source = ts.createSourceFile(file, input, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const isClient = /^\s*["']use client["'];/.test(input);
    const sourcePath = source.fileName.replaceAll("\\", "/");
    const auditClientErrors = !sourcePath.includes("/lib/");
    const auditUiFormatting = !sourcePath.includes("/lib/");
    const visit = (node) => {
      if (ts.isJsxText(node)) addFinding(source, node, node.getText(source), "text");

      if (ts.isJsxAttribute(node) && isTranslatableAttribute(node) && !isInternalControlAttribute(node)) {
        const value = node.initializer;
        if (value && ts.isStringLiteral(value)) addFinding(source, value, value.text, `attribute:${node.name.text}`);
      }

      const messageArgument = uiMessageArgument(node, isClient, auditClientErrors);
      if (messageArgument && (ts.isStringLiteralLike(messageArgument) || ts.isTemplateExpression(messageArgument))) {
        const text = literalText(messageArgument, source);
        if (text) addFinding(source, messageArgument, text, "message");
      }

      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text;
        if (auditUiFormatting && ["toFixed", "toLocaleString"].includes(method) && containingJsxExpression(node)) {
          addFinding(source, node, method, "locale-formatting");
        }
        if (auditUiFormatting && ["toLocaleDateString", "toLocaleTimeString", "toLocaleString"].includes(method)) {
          const localeArgument = node.arguments[0];
          if (!localeArgument || localeArgument.kind === ts.SyntaxKind.UndefinedKeyword || ts.isStringLiteralLike(localeArgument)) {
            addFinding(source, node, method, "locale-formatting");
          }
        }
      }

      if (auditUiFormatting && ts.isNewExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "Intl"
        && ["DateTimeFormat", "NumberFormat", "RelativeTimeFormat"].includes(node.expression.name.text)) {
        const localeArgument = node.arguments?.[0];
        if (!localeArgument || localeArgument.kind === ts.SyntaxKind.UndefinedKeyword || ts.isStringLiteralLike(localeArgument)) {
          addFinding(source, node, node.expression.name.text, "locale-formatting");
        }
      }

      if ((ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) && !isTranslationKeyArgument(node) && !isFullyLocalizedTemplate(node)) {
        const text = literalText(node, source);
        const expression = containingJsxExpression(node);
        if (expression && isProgramControlLiteral(node, expression)) {
          ts.forEachChild(node, visit);
          return;
        }
        const property = expression ? ancestorBefore(node, expression, ts.isPropertyAssignment) : null;
        const call = expression ? ancestorBefore(node, expression, ts.isCallExpression) : null;
        if (text && property) {
          const propertyName = property.name;
          const name = ts.isIdentifier(propertyName) || ts.isStringLiteralLike(propertyName) ? propertyName.text : "";
          if (isTranslatablePropertyName(name) && !isCssValue(text)) addFinding(source, node, text, `property:${name}`);
        } else if (text && expression && !call) {
          const attribute = ts.isJsxAttribute(expression.parent) ? expression.parent : null;
          if (!attribute || isTranslatableAttribute(attribute)) {
            addFinding(source, node, text, attribute ? `attribute:${attribute.name.text}` : "expression");
          }
        } else if (text && ts.isPropertyAssignment(node.parent)) {
          const property = node.parent.name;
          const name = ts.isIdentifier(property) || ts.isStringLiteralLike(property) ? property.text : "";
          if (isTranslatablePropertyName(name) && !isCssValue(text)) addFinding(source, node, text, `property:${name}`);
        }
      }

      ts.forEachChild(node, visit);
    };
    visit(source);
  }
}

const uniqueText = new Set(findings.map(({ text }) => text));
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ occurrences: findings.length, uniqueStrings: uniqueText.size, findings }, null, 2));
  process.exit(0);
}

console.log(`${findings.length} hardcoded UI-text occurrences (${uniqueText.size} unique strings).`);
for (const finding of findings) {
  console.log(`${finding.file}:${finding.line}  [${finding.kind}] ${finding.text}`);
}

// Debt ledger: surfaces imported from the retirement-locked Pro app still carry English
// literals. The baseline records the exact count allowed per file, so the gate keeps
// blocking every new occurrence while the recorded debt is burned down file by file.
const baselinePath = resolve(root, "localization-audit-baseline.json");
let baseline = null;
try {
  baseline = JSON.parse(await readFile(baselinePath, "utf8"));
} catch {
  baseline = null;
}

if (process.argv.includes("--strict")) {
  if (!baseline) {
    if (findings.length > 0) process.exitCode = 1;
  } else {
    const actual = new Map();
    for (const finding of findings) actual.set(finding.file, (actual.get(finding.file) ?? 0) + 1);
    const allowed = baseline.files ?? {};
    const regressions = [];
    for (const [file, count] of actual) {
      const limit = allowed[file] ?? 0;
      if (count > limit) regressions.push(`${file}: ${count} occurrences, baseline allows ${limit}`);
    }
    const tightened = Object.entries(allowed).filter(([file, limit]) => (actual.get(file) ?? 0) < limit);
    for (const [file, limit] of tightened) {
      console.log(`Baseline is loose for ${file}: ${actual.get(file) ?? 0} of ${limit} allowed occurrences remain — lower the entry.`);
    }
    if (regressions.length > 0) {
      console.log("\nStrict localization gate failed:");
      for (const regression of regressions) console.log(`- ${regression}`);
      process.exitCode = 1;
    } else {
      console.log(`Strict localization gate passed: ${findings.length} recorded occurrences, none above baseline.`);
    }
  }
}
