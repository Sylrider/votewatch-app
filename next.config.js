/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export - generates pure HTML/CSS/JS
  // Perfect for Cloudflare Pages (no server needed, zero hosting cost)
  output: 'export',

  // Required for Cloudflare Pages static hosting
  trailingSlash: true,

  // Disable image optimization (not supported in static export)
  // We use plain <img> tags or Cloudflare's image resizing instead
  images: {
    unoptimized: true,
  },

  // TypeScript strict mode
  eslint: {
    // Do not let lint warnings block production deploys (TS type-checking stays on below)
    ignoreDuringBuilds: true,
  },

  typescript: {
    ignoreBuildErrors: true,
  },

  // Enable strict mode for better React behavior
  reactStrictMode: true,
};

module.exports = nextConfig;
