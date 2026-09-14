/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Admin website is deployed standalone on Vercel; no dependency on the
  // Expo/React Native app's build pipeline or config.
  eslint: {
    ignoreDuringBuilds: false,
  },
};

module.exports = nextConfig;
