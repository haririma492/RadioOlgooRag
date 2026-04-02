/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "sciencepolicy.ca" },
      { protocol: "https", hostname: "**.s3.ca-central-1.amazonaws.com" },
      { protocol: "https", hostname: "**" }
    ],
  },
};
export default nextConfig;
