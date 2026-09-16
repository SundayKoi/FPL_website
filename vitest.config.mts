import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const nodeTests = ["src/lib/**/*.{test,spec}.ts", "scripts/**/*.{test,spec}.ts"];
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
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.{test,spec}.{ts,tsx}"],
          exclude: [...exclude, ...nodeTests],
          setupFiles: ["./src/test-utils/setup-dom.ts"],
        },
      },
    ],
  },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
