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
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
