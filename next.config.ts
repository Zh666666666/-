import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_MODE: process.env.APP_MODE ?? (process.env.NODE_ENV === "production" ? "invalid" : "demo"),
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
