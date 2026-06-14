import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  // Pin the workspace root to this project. Next infers the root by walking up
  // for a lockfile; a stray ~/package-lock.json otherwise hijacks it and breaks
  // module resolution (e.g. "Can't resolve 'tailwindcss'").
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
