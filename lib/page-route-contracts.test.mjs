/**
 * Guard the admin/developer page boundary and players overview route exports.
 * Execute the thin route wrappers without starting auth, API requests or Next.
 * refs: app/admin/page.tsx; app/operations/developer/page.tsx; app/players/page.tsx
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
const sharedDashboard = new URL("app/admin/admin-dashboard.tsx", root);
const Dashboard = () => null;

function parse(path) {
  const url = new URL(path, root);
  const text = readFileSync(url, "utf8");
  return { url, text, ast: ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX) };
}

function checkDashboardRoute(path, mode) {
  const { url, text, ast } = parse(path);
  const page = ast.statements.find((item) => ts.isFunctionDeclaration(item)
    && item.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword));
  assert.ok(page, "the page must export its route component");
  assert.equal(page.parameters.length, 0, "custom dashboard props belong on the shared component, not the Next page");
  const js = ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(js, {
    exports,
    require(specifier) {
      if (specifier === "react/jsx-runtime") return require(specifier);
      const target = specifier.startsWith("@/")
        ? new URL(`${specifier.slice(2)}.tsx`, root)
        : new URL(`${specifier}.tsx`, url);
      assert.equal(target.href, sharedDashboard.href, "both pages must import the same non-route dashboard module");
      return { __esModule: true, default: Dashboard };
    },
  }, { filename: path });
  assert.deepEqual(Object.keys(exports), ["default"]);
  const element = exports.default();
  assert.equal(element.type, Dashboard);
  assert.equal(element.props.mode, mode);
}

test("admin page accepts no custom props and selects the admin dashboard", () => {
  checkDashboardRoute("app/admin/page.tsx", "admin");
});

test("developer page reuses the non-route dashboard with developer permissions", () => {
  checkDashboardRoute("app/operations/developer/page.tsx", "developer");
});

test("players page keeps overview error keys private without changing their values", () => {
  const { ast } = parse("app/players/page.tsx");
  const variables = ast.statements.filter(ts.isVariableStatement);
  const keys = variables.find((item) => item.declarationList.declarations.some((decl) => decl.name.getText(ast) === "PLAYERS_ERROR_KEYS"));
  assert.ok(keys);
  assert.ok(!keys.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword), "arbitrary page exports violate the Next route contract");
  const exported = variables.filter((item) => item.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
    .flatMap((item) => item.declarationList.declarations.map((decl) => decl.name.getText(ast)));
  assert.deepEqual(exported.sort(), ["dynamic", "metadata"]);
  const initializer = keys.declarationList.declarations[0].initializer;
  assert.ok(ts.isAsExpression(initializer));
  const values = Object.fromEntries(initializer.expression.properties.map((property) => [property.name.getText(ast), property.initializer.text]));
  assert.deepEqual(values, {
    overviewConfigUnavailable: "generated.players.overviewConfigUnavailable",
    overviewUnavailable: "generated.players.overviewUnavailable",
  });
});
