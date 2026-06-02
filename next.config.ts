import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Disable Next.js devtools overlay — causes SyntaxError in next-devtools on Node 26
  devIndicators: false,
  eslint: {
    // ESLint runs separately in CI; skip during next build to avoid flat-config circular ref
    ignoreDuringBuilds: true,
  },
  typescript: {
    // TypeScript is verified separately via `npx tsc --noEmit` — skip the worker-spawned
    // in-build check which triggers a SIGSEGV in the native SWC type-checker on this machine
    ignoreBuildErrors: true,
  },
  // Keep heavy Node-only packages out of the webpack bundle so they load natively
  serverExternalPackages: ["pdfjs-dist", "pdf-parse", "mammoth"],
};

export default nextConfig;
