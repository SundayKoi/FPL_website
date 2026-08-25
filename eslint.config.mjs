import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated/config files we don't lint:
    "supabase/**",
    // Checked-out git worktrees: each is a full copy of the repo on another
    // branch, so linting them reports every finding a second time.
    ".worktrees/**",
    // The harness's worktree tool uses its own directory, which the pattern
    // above never matched — a session working in one reported hundreds of
    // errors from that copy's build output instead of a clean run.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
