/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["cheerio"]
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/home",
        permanent: false
      }
    ];
  }
};

export default nextConfig;
