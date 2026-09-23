import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Hidden information never reaches the browser (the expeditions design,
// §0 and §4): a run's road is derived from its seed, so a client bundle
// that holds routes.ts (ROADS and the draw), journal.ts (every line the
// squad will write, and the encounters on legs not yet walked) or
// views.ts (which imports both) holds every checkpoint a squad has not
// reached, one hover away. The page derives what the squad knows on the
// server and hands the board only that.
//
// This reads the source of every module that can end up in a client
// bundle — every "use client" module, the board's own components whatever
// their directive, and everything they import, transitively, through
// value imports — and fails on a value import of any of the three. A type
// import is erased at build and allowed; `import { type X }` is not
// counted as one (write `import type`). A "use server" module is where the
// walk stops: the client bundle holds a reference to it, not its imports.

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const rel = (file: string) => relative(ROOT, file);

/** The three modules the browser must never hold. */
const FORBIDDEN = ["routes", "journal", "views"].map((name) => join(SRC, "lib/expeditions", `${name}.ts`));

/** The board's own client modules, named so they are checked even if
 *  nothing imports them any more — the living map's among them: it draws
 *  a RunView and may only name its types. */
const BOARD = [
  "components/cards/ExpeditionBoard.tsx",
  "components/cards/LivingMap.tsx",
  "components/cards/mapLayout.ts",
  "components/cards/mapTerrain.tsx",
  "components/cards/mapGlyphs.tsx",
  "components/cards/AtlasPanel.tsx",
  "components/cards/ExpeditionRules.tsx",
  "components/cards/CampaignPanel.tsx",
  "components/cards/CampPanel.tsx",
  "components/cards/LeagueGoalPanel.tsx",
  "components/cards/expeditionIcons.tsx",
];

interface Edge {
  spec: string;
  /** The local file it resolves to, or null for a package or a non-TS asset. */
  target: string | null;
  typeOnly: boolean;
}

function resolveLocal(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (/\.tsx?$/.test(candidate) && existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Every module a source imports or re-exports from, and whether the
 *  build erases it. */
function importsOf(file: string, text = readFileSync(file, "utf8")): Edge[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edges: Edge[] = [];
  const add = (spec: string, typeOnly: boolean) => edges.push({ spec, target: resolveLocal(file, spec), typeOnly });
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      add(node.moduleSpecifier.text, node.importClause?.isTypeOnly === true);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      add(node.moduleSpecifier.text, node.isTypeOnly);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
      node.arguments.length > 0 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      add(node.arguments[0].text, false);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return edges;
}

/** The file's directive prologue, as the bundler reads it. */
function directive(text: string): "use client" | "use server" | null {
  const match = text.match(/^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["'](use client|use server)["']/);
  return (match?.[1] as "use client" | "use server" | undefined) ?? null;
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
  });
}

/** Everything that can reach a client bundle from these roots, with the
 *  chain that brought each module in. */
function clientGraph(roots: string[]): Map<string, string[]> {
  const chain = new Map<string, string[]>();
  const queue = roots.map((root) => [root]);
  while (queue.length > 0) {
    const path = queue.shift()!;
    const file = path[path.length - 1];
    if (chain.has(file)) continue;
    chain.set(file, path);
    const text = readFileSync(file, "utf8");
    // A server action is a reference in the client bundle, not its code.
    if (path.length > 1 && directive(text) === "use server") continue;
    for (const edge of importsOf(file, text)) {
      if (edge.typeOnly || !edge.target || chain.has(edge.target)) continue;
      queue.push([...path, edge.target]);
    }
  }
  return chain;
}

const allSources = sources(SRC);
const clientRoots = allSources.filter((file) => directive(readFileSync(file, "utf8")) === "use client");
// The board's folder whole, whatever each module's directive: a server
// component there today is one import away from the client tomorrow.
const boardRoots = [...BOARD.map((path) => join(SRC, path)).filter(existsSync), ...sources(join(SRC, "components/cards/expeditions"))];
const graph = clientGraph([...new Set([...boardRoots, ...clientRoots])]);

describe("the expedition board's client bundle", () => {
  it("finds the board and what it reads, so the walk below means something", () => {
    for (const path of BOARD) expect(existsSync(join(SRC, path)), path).toBe(true);
    expect(clientRoots.length).toBeGreaterThan(50);
    for (const path of [
      "components/cards/ExpeditionBoard.tsx",
      "components/cards/expeditions/ForkPrompt.tsx",
      "components/cards/expeditions/RunCard.tsx",
      "components/cards/expeditions/RightNow.tsx",
      "components/cards/expeditions/RouteStep.tsx",
      "components/cards/LivingMap.tsx",
      "components/cards/mapLayout.ts",
      "components/cards/mapTerrain.tsx",
      "components/cards/ExpeditionRules.tsx",
      "components/cards/CampaignPanel.tsx",
      "components/cards/expeditions/ExpeditionsHeader.tsx",
      "lib/expeditions/forks.ts",
      "lib/expeditions/queries.ts",
      "lib/expeditions/config.ts",
    ]) {
      expect(graph.has(join(SRC, path)), path).toBe(true);
    }
    // The server action module is reached, and the walk stops at it.
    expect(graph.has(join(SRC, "lib/expeditions/actions.ts"))).toBe(true);
    expect(graph.has(join(SRC, "lib/expeditions/runs.ts"))).toBe(false);
  });

  it("never value-imports routes.ts, journal.ts or views.ts, directly or through a module it imports", () => {
    const leaks: string[] = [];
    for (const [file, path] of graph) {
      if (FORBIDDEN.includes(file)) leaks.push(path.map(rel).join(" → "));
    }
    expect(leaks).toEqual([]);
  });

  it("imports their types freely", () => {
    // Type imports are erased: the board may name RunView, the ceremony
    // CardFate. At least one such import exists, or this proves nothing.
    const typed = [...graph.keys()].flatMap((file) => importsOf(file).filter((edge) => edge.typeOnly && edge.target && FORBIDDEN.includes(edge.target)));
    expect(typed.length).toBeGreaterThan(0);
  });
});

describe("importsOf", () => {
  const file = join(SRC, "components/cards/Example.tsx");
  const edges = (text: string) => importsOf(file, text).map((edge) => ({ to: edge.target ? rel(edge.target) : edge.spec, typeOnly: edge.typeOnly }));

  it("tells a value import from a type import, however it is written", () => {
    expect(
      edges(
        [
          'import { forksFor } from "@/lib/expeditions/routes";',
          'import type { RunView } from "@/lib/expeditions/views";',
          'import { type JournalEntry } from "@/lib/expeditions/journal";',
          'import {\n  journalFor,\n  type JournalEntry,\n} from "../../lib/expeditions/journal";',
          'export { ROADS } from "@/lib/expeditions/routes";',
          'export type { PlaceView } from "@/lib/expeditions/views";',
          'const later = () => import("@/lib/expeditions/views");',
          'import "@/lib/expeditions/journal";',
          'import { useState } from "react";',
        ].join("\n"),
      ),
    ).toEqual([
      { to: "src/lib/expeditions/routes.ts", typeOnly: false },
      { to: "src/lib/expeditions/views.ts", typeOnly: true },
      // Written as a value import: the build may keep it. Say `import type`.
      { to: "src/lib/expeditions/journal.ts", typeOnly: false },
      { to: "src/lib/expeditions/journal.ts", typeOnly: false },
      { to: "src/lib/expeditions/routes.ts", typeOnly: false },
      { to: "src/lib/expeditions/views.ts", typeOnly: true },
      { to: "src/lib/expeditions/views.ts", typeOnly: false },
      { to: "src/lib/expeditions/journal.ts", typeOnly: false },
      { to: "react", typeOnly: false },
    ]);
  });

  it("reads a directive past the comments above it", () => {
    expect(directive('// a note\n/* and another */\n"use client";\nimport x from "y";')).toBe("use client");
    expect(directive('"use server";')).toBe("use server");
    expect(directive('import x from "y";\n"use client";')).toBeNull();
  });
});
