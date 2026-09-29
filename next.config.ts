import type { NextConfig } from "next";

const testDistDir = process.env.FPL_TEST_NEXT_DIST_DIR;

const nextConfig: NextConfig = {
  ...(testDistDir ? { distDir: testDistDir } : {}),
};

export default nextConfig;
