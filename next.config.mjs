/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["cheerio"]
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lain.bgm.tv"
      },
      {
        protocol: "https",
        hostname: "lain.bangumi.tv"
      },
      {
        protocol: "https",
        hostname: "lain.chii.in"
      }
    ]
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
