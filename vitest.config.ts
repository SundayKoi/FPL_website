import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const nodeTests = ["src/lib/**/*.test.ts", "scripts/**/*.test.ts"];
const exclude = [...configDefaults.exclude, "e2e/**", ".worktrees/**", ".claude/worktrees/**"];

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: { name: "node", environment: "node", include: nodeTests, exclude },
      },
      {
        extends: true,
        test: { name: "dom", environment: "jsdom", exclude: [...exclude, ...nodeTests] },
      },
    ],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
