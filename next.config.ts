import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  // pin tracing to this project (silences the multi-lockfile root inference warning)
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
