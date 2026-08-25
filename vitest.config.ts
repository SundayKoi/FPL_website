import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    // e2e/ holds Playwright specs, run via `npm run e2e`, not vitest — without
    // this exclusion vitest's default *.spec.ts glob picks them up too and
    // fails immediately (Playwright's test() isn't valid outside its runner).
    // .worktrees/ holds linked git worktrees (whole checkouts of this repo);
    // crawling them duplicates every suite and runs their e2e specs too.
    // .claude/worktrees/ is the same thing from the harness's own worktree
    // tool — a different directory, so the exclusion above never covered it,
    // and a session working in one turned `npm test` red with hundreds of
    // failures from the OTHER branch's copy of every suite.
    exclude: [...configDefaults.exclude, "e2e/**", ".worktrees/**", ".claude/worktrees/**"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
