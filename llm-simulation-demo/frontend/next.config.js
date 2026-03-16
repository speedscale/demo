/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // API proxying is handled at runtime by src/app/api/[...path]/route.ts
  // using the BACKEND_URL env var, so no build-time rewrites are needed.
};

module.exports = nextConfig;
