import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Heavy render libs (Remotion/FFmpeg) run in the worker container, not here.
  serverExternalPackages: ["@remotion/renderer", "@remotion/bundler"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
    ],
  },
};

export default nextConfig;
