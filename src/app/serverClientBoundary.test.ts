import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Every export of a "use client" module becomes a CLIENT REFERENCE on the
// server. Rendering one as JSX is the whole point — that is how client
// components work. But CALLING one from a Server Component throws at
// request time, which is a runtime failure no type check catches: the types
// say `(tier: string) => string` and the value is a reference object.
//
// That is how the binder page shipped broken — it imported tierLabel, a
// plain function, from CardCopyPreview.tsx. The fix was to move the helper
// to a directive-free module, and this is the guard so the next one is
// caught here instead of on the deployed page.
//
// The heuristic is this codebase's own convention: components are
// PascalCase, everything else is not. A lowercase named import out of a
// client module is a value someone intends to call.

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function isClientModule(path: string): boolean {
  try {
    return /^\s*["']use client["']/.test(readFileSync(path, "utf8"));
  } catch {
    return false;
  }
}

/** "@/components/x" | "./x" -> the file it resolves to, or null. */
function resolve(specifier: string, fromFile: string): string | null {
  const base = specifier.startsWith("@/")
    ? join("src", specifier.slice(2))
    : specifier.startsWith(".")
      ? join(fromFile, "..", specifier)
      : null;
  if (!base) return null;
  for (const candidate of [`${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // not this one
    }
  }
  return null;
}

describe("server/client boundary", () => {
  it("never calls a plain function imported from a client module in a server file", () => {
    const offenders: string[] = [];
    const serverFiles = walk("src/app").filter(
      (path) => /\.(tsx|ts)$/.test(path) && !path.includes(".test.") && !isClientModule(path),
    );

    for (const file of serverFiles) {
      const source = readFileSync(file, "utf8");
      // `import { a, b as c } from "..."` — named imports only; a default
      // import of a component is the normal, correct case.
      for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
        const target = resolve(match[2], file);
        if (!target || !isClientModule(target)) continue;
        for (const raw of match[1].split(",")) {
          const name = raw.trim().split(/\s+as\s+/).pop()?.trim();
          // `import type { X }` is erased at compile time and never called.
          if (!name || raw.trim().startsWith("type ")) continue;
          if (/^[a-z]/.test(name)) offenders.push(`${file} imports ${name} from ${target}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
