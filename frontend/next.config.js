/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,  // don't fail build on lint warnings
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

module.exports = nextConfig;
